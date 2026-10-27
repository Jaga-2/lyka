import json
import time
import unittest
from unittest.mock import Mock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.user import User
from app.models.property import Property
from app.models.lead import Lead
from app.models.conversation import Conversation, Message
from app.routers import auth, crm, ai, properties
from app.schemas.ai import AIChatRequest
from app.services.ai_service import (
    _is_pure_greeting,
    _missing_core_requirements,
    prepare_ai_conversation_context,
)


class AISpeedGreetingAndSessionIsolationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine, expire_on_commit=False)()

        # Users for isolation and RBAC tests
        self.user_a = User(
            id=101,
            email="user_a@example.com",
            hashed_password="not-used",
            full_name="Customer Alice",
            role="customer",
            is_active=True,
        )
        self.user_b = User(
            id=102,
            email="user_b@example.com",
            hashed_password="not-used",
            full_name="Customer Bob",
            role="customer",
            is_active=True,
        )
        self.sales = User(
            id=103,
            email="sales@example.com",
            hashed_password="not-used",
            full_name="Sales Rep",
            role="sales_agent",
            is_active=True,
        )
        self.manager = User(
            id=104,
            email="manager@example.com",
            hashed_password="not-used",
            full_name="Team Manager",
            role="manager",
            is_active=True,
        )
        self.admin = User(
            id=105,
            email="admin@example.com",
            hashed_password="not-used",
            full_name="Admin Director",
            role="admin",
            is_active=True,
        )
        self.super_admin = User(
            id=106,
            email="super@example.com",
            hashed_password="not-used",
            full_name="Super Admin",
            role="super_admin",
            is_active=True,
        )
        self.session.add_all([
            self.user_a,
            self.user_b,
            self.sales,
            self.manager,
            self.admin,
            self.super_admin,
        ])

        # Test real property inventory
        self.properties = [
            Property(
                id=501,
                title="Marina Heights 2BR",
                address="Dubai Marina",
                location="Dubai Marina",
                city="Dubai",
                rent_price=110000.0,
                sale_price=None,
                currency="AED",
                beds=2,
                baths=2,
                property_type="Apartment",
                area_sqft=1200.0,
                furnishing="Furnished",
                purpose="For Rent",
                amenities="[]",
                images="[]",
                is_active=True,
            ),
            Property(
                id=502,
                title="Downtown Luxury 1BR",
                address="Downtown Dubai",
                location="Downtown Dubai",
                city="Dubai",
                rent_price=130000.0,
                sale_price=None,
                currency="AED",
                beds=1,
                baths=2,
                property_type="Apartment",
                area_sqft=900.0,
                furnishing="Unfurnished",
                purpose="For Rent",
                amenities="[]",
                images="[]",
                is_active=True,
            ),
        ]
        self.session.add_all(self.properties)
        self.session.commit()

        self.app = FastAPI()
        for router in (auth.router, crm.router, ai.router, properties.router):
            self.app.include_router(router, prefix="/api")

        def override_get_db():
            yield self.session

        self.app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(self.app)

        # Mock AI model completions for fast deterministic testing
        self.mock_response = Mock()
        self.mock_response.choices = [Mock(message=Mock(content="Hello! Welcome to LYKA Realty. How can I help you find your dream home in Dubai?"))]
        self.mock_client = Mock()
        self.mock_client.chat.completions.create.return_value = self.mock_response

        self.patches = [
            patch("app.services.ai_service.settings.AI_PROVIDER", "openai"),
            patch("app.services.ai_service.settings.OPENAI_API_KEY", "test-key"),
            patch("app.services.ai_service.openai.OpenAI", return_value=self.mock_client),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.client.close()
        self.session.close()
        self.engine.dispose()

    def _auth_headers(self, user: User):
        from app.services.auth_service import create_access_token
        token = create_access_token({"sub": str(user.id), "email": user.email, "role": user.role})
        return {"Authorization": f"Bearer {token}"}

    # 1. Greeting-Only Behavior & No Premature Recommendations
    def test_pure_greetings_detected_accurately(self):
        for greeting in ("Hi", "Hello", "Hey", "good morning", "Hello there", "வணக்கம்", "Vanakkam"):
            self.assertTrue(_is_pure_greeting(greeting), f"Failed for: {greeting}")
        for non_greeting in ("I want a 2 BHK in Marina", "Show properties", "Hello, I want to rent in Downtown"):
            self.assertFalse(_is_pure_greeting(non_greeting), f"False positive for: {non_greeting}")

    def test_greeting_returns_zero_properties_and_greeting_only(self):
        reqs, action, props, prompt, hist, lang = prepare_ai_conversation_context(
            db=self.session,
            message="Hi",
            history=[],
            current_requirements={},
        )
        self.assertEqual(action, "greeting")
        self.assertEqual(props, [], "Greeting must not recommend properties prematurely")
        self.assertEqual(lang, "en")

    def test_chat_endpoint_on_hi_returns_greeting_and_empty_properties(self):
        headers = self._auth_headers(self.user_a)
        res = self.client.post(
            "/api/ai/chat",
            headers=headers,
            json={"message": "Hello", "conversation_id": "test-greeting-conv"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["action_type"], "greeting")
        self.assertEqual(data["properties"], [])
        self.assertIn("LYKA Realty", data["response"])

        call_args = self.mock_client.chat.completions.create.call_args
        system_content = call_args.kwargs["messages"][0]["content"]
        self.assertIn("GREETING TURN", system_content)
        self.assertIn("DO NOT list or recommend any properties yet", system_content)

    # 2. Recommendation Gating: Requirements Gathering Before Search
    def test_consultation_gated_until_core_criteria_provided(self):
        # User only says "I want to rent an apartment" (missing location and budget)
        reqs, action, props, prompt, hist, system = prepare_ai_conversation_context(
            db=self.session,
            message="I want to rent an apartment",
            history=[],
            current_requirements={},
        )
        self.assertEqual(action, "consultation")
        self.assertEqual(props, [], "Consultation must gate property recommendations until criteria gathered")
        missing = _missing_core_requirements(reqs)
        self.assertIn("preferred location", missing)

    def test_recommendations_triggered_when_location_and_bedrooms_gathered(self):
        # When user provides location and bedrooms:
        reqs, action, props, prompt, hist, system = prepare_ai_conversation_context(
            db=self.session,
            message="Show 2 BHK in Dubai Marina for rent",
            history=[],
            current_requirements={"purpose": "rent"},
        )
        self.assertEqual(action, "search")
        self.assertTrue(len(props) > 0)
        self.assertEqual(props[0].id, 501)
        self.assertEqual(props[0].beds, 2)
        self.assertEqual(props[0].location, "Dubai Marina")

    # 3. Private Conversations & Strict Session Isolation
    def test_conversation_isolated_per_user_cross_access_forbidden(self):
        # User A creates a conversation
        headers_a = self._auth_headers(self.user_a)
        res_a = self.client.post(
            "/api/ai/chat",
            headers=headers_a,
            json={"message": "I want a 2 BHK in Dubai Marina", "conversation_id": "alice-private-chat"},
        )
        self.assertEqual(res_a.status_code, 200)

        # User B attempts to access User A's conversation details
        headers_b = self._auth_headers(self.user_b)
        res_b_get = self.client.get(
            "/api/ai/conversations/alice-private-chat",
            headers=headers_b,
        )
        self.assertEqual(res_b_get.status_code, 403, "User B must not access User A's private conversation")

        # User B attempts to post into User A's conversation
        res_b_post = self.client.post(
            "/api/ai/chat",
            headers=headers_b,
            json={"message": "Infiltrating conversation", "conversation_id": "alice-private-chat"},
        )
        self.assertEqual(res_b_post.status_code, 403, "User B must not mutate User A's private conversation")

        # User A can access their own conversation
        res_a_get = self.client.get(
            "/api/ai/conversations/alice-private-chat",
            headers=headers_a,
        )
        self.assertEqual(res_a_get.status_code, 200)
        self.assertEqual(res_a_get.json()["id"], "alice-private-chat")

        # Listing conversations shows only user's own conversations
        res_b_list = self.client.get("/api/ai/conversations", headers=headers_b)
        self.assertEqual(res_b_list.status_code, 200)
        self.assertEqual(res_b_list.json(), [], "User B must not see User A's conversation in list")

    # 4. Response Timing & Fast AI Flow
    def test_ai_response_timing_within_fast_threshold(self):
        headers = self._auth_headers(self.user_a)
        start_time = time.perf_counter()
        res = self.client.post(
            "/api/ai/chat",
            headers=headers,
            json={"message": "Hi", "conversation_id": "timing-test-conv"},
        )
        duration_ms = (time.perf_counter() - start_time) * 1000
        self.assertEqual(res.status_code, 200)
        # Fast local/mock turn must complete well under 2000ms
        self.assertLess(duration_ms, 2000, f"Turn took too long: {duration_ms:.1f}ms")

    # 5. Role Permissions
    def test_role_permissions_for_manager_sales_and_admin(self):
        # Manager can access manager pipeline
        headers_mgr = self._auth_headers(self.manager)
        res_mgr = self.client.get("/api/manager/pipeline", headers=headers_mgr)
        self.assertEqual(res_mgr.status_code, 200)

        # Sales agent cannot access manager pipeline
        headers_sales = self._auth_headers(self.sales)
        res_sales_blocked = self.client.get("/api/manager/pipeline", headers=headers_sales)
        self.assertEqual(res_sales_blocked.status_code, 403)

        # Sales agent can access employee leads
        res_sales_leads = self.client.get("/api/employee/leads", headers=headers_sales)
        self.assertEqual(res_sales_leads.status_code, 200)

        # Customer cannot access employee leads
        headers_cust = self._auth_headers(self.user_a)
        res_cust_blocked = self.client.get("/api/employee/leads", headers=headers_cust)
        self.assertEqual(res_cust_blocked.status_code, 403)

        # Super admin config endpoint access
        headers_admin = self._auth_headers(self.admin)
        res_admin_blocked = self.client.get("/api/super-admin/platform-config", headers=headers_admin)
        self.assertEqual(res_admin_blocked.status_code, 403)
