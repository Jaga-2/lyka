import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, SessionLocal, engine, get_db
from app.models.conversation import Conversation, CustomerRequirement, Message
from app.models.lead import Lead
from app.models.property import Property
from app.models.site_visit import HandoffRequest, SiteVisit
from app.models.user import User
from app.routers import ai, auth, crm, visits
from app.routers import properties
from app.services.auth_service import create_access_token, hash_password
from reset_account_password import engine as reset_engine
from reset_account_password import reset_active_account_password


class AuthRBACTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.customer = self.add_user("customer@example.com", "customer")
        self.other_customer = self.add_user("other@example.com", "customer")
        self.employee = self.add_user("employee@example.com", "employee")
        self.admin = self.add_user("admin@example.com", "admin")
        self.session.add(
            Property(
                id=100,
                title="Test apartment",
                address="Dubai Marina",
                location="Dubai Marina",
                city="Dubai",
                rent_price=100_000,
                beds=2,
                baths=2,
                property_type="Apartment",
                area_sqft=1000,
                purpose="For Rent",
                amenities="[]",
                images="[]",
            )
        )
        self.session.add(Conversation(id="owned-chat", user_id=self.customer.id, context_json="{}"))
        self.session.commit()

        self.app = FastAPI()
        for router in (auth.router, crm.router, visits.router, ai.router, properties.router):
            self.app.include_router(router, prefix="/api")

        def override_get_db():
            yield self.session

        self.app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.session.close()
        self.engine.dispose()

    def add_user(self, email, role, active=True):
        user = User(
            email=email,
            hashed_password=hash_password("correct-horse-123"),
            full_name=role.title(),
            role=role,
            is_active=active,
        )
        self.session.add(user)
        self.session.flush()
        return user

    def token(self, user):
        return {"Authorization": f"Bearer {create_access_token({'sub': user.id})}"}

    def test_auth_and_password_reset_use_the_existing_backend_sqlite_database(self):
        expected_database = (Path(__file__).parents[1] / "lyka_realty.db").resolve()

        self.assertEqual(engine.dialect.name, "sqlite")
        self.assertEqual(Path(engine.url.database).resolve(), expected_database)
        self.assertIs(reset_engine, engine)
        self.assertIs(SessionLocal.kw["bind"], engine)

    def test_employee_and_admin_routes_require_the_correct_roles(self):
        self.assertEqual(self.client.get("/api/employee/leads").status_code, 401)
        self.assertEqual(
            self.client.get("/api/employee/leads", headers=self.token(self.customer)).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/api/admin/stats", headers=self.token(self.employee)).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/api/employee/leads", headers=self.token(self.employee)).status_code,
            200,
        )
        self.assertEqual(
            self.client.get("/api/admin/stats", headers=self.token(self.admin)).status_code,
            200,
        )

    def test_public_registration_cannot_elevate_role(self):
        response = self.client.post(
            "/api/auth/register",
            json={
                "email": "new-user@example.com",
                "password": "correct-horse-456",
                "full_name": "New User",
                "role": "admin",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "customer")
        self.assertIn("lyka_access_token", response.cookies)
        self.assertIsNone(response.json().get("access_token"))
        self.assertEqual(
            self.client.get("/api/admin/stats").status_code,
            403,
        )

    def test_only_admin_can_create_employee_accounts(self):
        body = {
            "email": "created-employee@example.com",
            "password": "secure-password-8",
            "full_name": "Created Employee",
        }
        self.assertEqual(
            self.client.post("/api/admin/employees", json=body, headers=self.token(self.employee)).status_code,
            403,
        )
        created = self.client.post("/api/admin/employees", json=body, headers=self.token(self.admin))
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["role"], "employee")

    def test_shortlists_and_conversations_are_scoped_to_the_signed_in_customer(self):
        login_response = self.client.post(
            "/api/auth/login",
            json={"email": self.customer.email, "password": "correct-horse-123"},
        )
        self.assertEqual(login_response.status_code, 200, login_response.text)
        self.assertEqual(login_response.json()["user"]["role"], "customer")
        csrf_token = login_response.cookies.get("lyka_csrf_token")
        self.assertTrue(csrf_token)
        csrf_headers = {"X-CSRF-Token": csrf_token}
        other_headers = self.token(self.other_customer)
        self.assertEqual(
            self.client.post("/api/customer/shortlist/100", headers=csrf_headers).json(),
            {"is_shortlisted": True},
        )
        self.assertEqual(len(self.client.get("/api/customer/shortlist").json()), 1)
        self.assertEqual(self.client.get("/api/customer/shortlist", headers=other_headers).json(), [])
        with patch("app.routers.ai.settings.OPENAI_API_KEY", "test-provider-key"), patch(
            "app.services.ai_service.openai.OpenAI", return_value=Mock()
        ):
            response = self.client.post(
                "/api/ai/chat",
                headers=other_headers,
                json={"message": "hello", "conversation_id": "owned-chat"},
            )
        self.assertEqual(response.status_code, 403)

    def test_inactive_users_cannot_authenticate(self):
        inactive = self.add_user("inactive@example.com", "employee", active=False)
        response = self.client.post(
            "/api/auth/login",
            json={"email": inactive.email, "password": "correct-horse-123"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.client.get("/api/employee/leads", headers=self.token(inactive)).status_code, 401)

    def test_login_returns_the_existing_employee_and_admin_roles(self):
        for user in (self.employee, self.admin):
            with self.subTest(role=user.role):
                response = self.client.post(
                    "/api/auth/login",
                    json={"email": user.email, "password": "correct-horse-123"},
                )
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["user"]["role"], user.role)
                self.assertIn("lyka_access_token", response.cookies)
                self.assertIsNone(response.json().get("access_token"))

    def test_login_normalizes_email_and_returns_customer_session(self):
        response = self.client.post(
            "/api/auth/login",
            json={"email": "CUSTOMER@EXAMPLE.COM", "password": "correct-horse-123"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["user"]["id"], self.customer.id)
        self.assertEqual(response.json()["user"]["role"], "customer")
        self.assertIn("lyka_access_token", response.cookies)
        self.assertIsNone(response.json().get("access_token"))

        me_response = self.client.get("/api/auth/me")
        self.assertEqual(me_response.status_code, 200, me_response.text)
        self.assertEqual(me_response.json()["id"], self.customer.id)
        self.assertEqual(me_response.json()["role"], "customer")
        self.assertEqual(self.client.get("/api/employee/leads").status_code, 403)
        self.assertEqual(self.client.get("/api/admin/stats").status_code, 403)

    def test_login_with_x_request_token_header_returns_bearer_token_for_cross_origin_clients(self):
        # 1. Standard login without x-request-token preserves ambient-cookie response (token omitted from JSON)
        default_resp = self.client.post(
            "/api/auth/login",
            json={"email": self.customer.email, "password": "correct-horse-123"},
        )
        self.assertEqual(default_resp.status_code, 200)
        self.assertIsNone(default_resp.json().get("access_token"))

        # 2. Login with X-Request-Token header returns Bearer access_token for cross-origin clients
        client_resp = self.client.post(
            "/api/auth/login",
            json={"email": self.customer.email, "password": "correct-horse-123"},
            headers={"X-Request-Token": "true"},
        )
        self.assertEqual(client_resp.status_code, 200)
        token = client_resp.json().get("access_token")
        self.assertIsNotNone(token)
        self.assertEqual(client_resp.json().get("token_type"), "bearer")

        # 3. New client without ambient cookies can successfully access /customer/shortlist using Bearer token
        bearer_client = TestClient(self.app)
        shortlist_resp = bearer_client.get(
            "/api/customer/shortlist",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(shortlist_resp.status_code, 200)
        self.assertIsInstance(shortlist_resp.json(), list)

        # 4. Without Bearer token or cookies, request receives 401 Unauthorized
        unauth_resp = bearer_client.get("/api/customer/shortlist")
        self.assertEqual(unauth_resp.status_code, 401)
        self.assertEqual(
            unauth_resp.json()["detail"],
            "Authentication credentials were not provided or invalid",
        )

    def test_login_rejects_wrong_password_and_unknown_email(self):
        wrong_password = self.client.post(
            "/api/auth/login",
            json={"email": self.customer.email, "password": "incorrect-password"},
        )
        unknown_email = self.client.post(
            "/api/auth/login",
            json={"email": "unknown@example.com", "password": "correct-horse-123"},
        )
        self.assertEqual(wrong_password.status_code, 401)
        self.assertEqual(unknown_email.status_code, 401)
        self.assertEqual(wrong_password.json()["detail"], unknown_email.json()["detail"])

    def test_inactive_employee_and_admin_login_are_rejected_before_password_check(self):
        inactive_employee = self.add_user("inactive-employee@example.com", "employee", active=False)
        inactive_admin = self.add_user("inactive-admin@example.com", "admin", active=False)
        for inactive in (inactive_employee, inactive_admin):
            with self.subTest(role=inactive.role), patch("app.routers.auth.verify_password") as verify:
                response = self.client.post(
                    "/api/auth/login",
                    json={"email": inactive.email, "password": "correct-horse-123"},
                )
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json()["detail"], "Invalid email or password")
                verify.assert_not_called()

    def test_registration_prevents_case_variant_duplicate_emails(self):
        response = self.client.post(
            "/api/auth/register",
            json={
                "email": "CUSTOMER@EXAMPLE.COM",
                "password": "secure-password-8",
                "full_name": "Duplicate Customer",
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_password_reset_changes_only_password_for_existing_active_accounts(self):
        old_role = self.customer.role
        old_active = self.customer.is_active
        reset_active_account_password(
            self.session,
            self.customer.email.upper(),
            "new-secure-password",
        )
        self.session.refresh(self.customer)
        login_response = self.client.post(
            "/api/auth/login",
            json={"email": self.customer.email, "password": "new-secure-password"},
        )
        self.assertEqual(login_response.status_code, 200, login_response.text)
        self.assertEqual(self.customer.role, old_role)
        self.assertEqual(self.customer.is_active, old_active)

        employee = self.employee
        reset_active_account_password(
            self.session,
            employee.email,
            "employee-new-password",
        )
        employee_login = self.client.post(
            "/api/auth/login",
            json={"email": employee.email, "password": "employee-new-password"},
        )
        self.assertEqual(employee_login.status_code, 200, employee_login.text)
        self.assertEqual(employee.role, "employee")
        self.assertTrue(employee.is_active)

        inactive_customer = self.add_user("inactive-customer@example.com", "customer", active=False)
        with self.assertRaises(ValueError):
            reset_active_account_password(
                self.session,
                inactive_customer.email,
                "new-secure-password",
            )

    def test_site_visits_are_customer_scoped_and_staff_managed(self):
        headers = self.token(self.customer)
        visit_response = self.client.post(
            "/api/site-visits",
            headers=headers,
            json={
                "property_id": 100,
                "customer_name": "Spoofed Name",
                "customer_email": "spoofed@example.com",
                "customer_phone": "+971500000000",
                "preferred_date": "2030-01-15",
                "preferred_time": "10:00 AM",
            },
        )
        self.assertEqual(visit_response.status_code, 200)
        self.assertEqual(visit_response.json()["customer_name"], self.customer.full_name)
        self.assertEqual(visit_response.json()["customer_email"], self.customer.email)
        self.assertEqual(len(self.client.get("/api/site-visits/my-visits", headers=headers).json()), 1)
        self.assertEqual(
            self.client.get("/api/site-visits/my-visits", headers=self.token(self.other_customer)).json(),
            [],
        )
        self.assertEqual(self.client.get("/api/site-visits", headers=headers).status_code, 403)
        self.assertEqual(
            self.client.patch(
                f"/api/site-visits/{visit_response.json()['id']}/status",
                headers=headers,
                json={"status": "COMPLETED"},
            ).status_code,
            403,
        )
        staff_update = self.client.patch(
            f"/api/site-visits/{visit_response.json()['id']}/status",
            headers=self.token(self.employee),
            json={"status": "COMPLETED"},
        )
        self.assertEqual(staff_update.status_code, 200)
        self.assertEqual(staff_update.json()["status"], "COMPLETED")

    def test_authenticated_customer_workflow_owns_every_record_and_isolation_holds(self):
        requirements = {
            "purpose": "rent",
            "buy_or_rent": "rent",
            "location": "Dubai Marina",
            "bedrooms": 2,
            "property_type": "Apartment",
            "language": "en",
        }
        property_item = self.session.query(Property).filter(Property.id == 100).one()

        def mock_conversation(db, message, history, current_requirements, context):
            if "agent" in message.lower():
                action = "agent"
            elif "visit" in message.lower():
                action = "site_visit"
            elif "interested" in message.lower():
                action = "general"
            else:
                action = "search"
            properties_found = [property_item] if action in {"search", "site_visit"} else []
            return "Request recorded for testing.", properties_found, requirements, action

        login_response = self.client.post(
            "/api/auth/login",
            json={"email": self.customer.email, "password": "correct-horse-123"},
        )
        self.assertEqual(login_response.status_code, 200, login_response.text)
        self.assertEqual(login_response.json()["user"]["role"], "customer")
        csrf_token = login_response.cookies.get("lyka_csrf_token")
        self.assertTrue(csrf_token)
        customer_headers = {"X-CSRF-Token": csrf_token}
        other_headers = self.token(self.other_customer)
        conversation_id = "customer-a-workflow"
        with patch("app.routers.ai.settings.AI_PROVIDER", "openai"), patch(
            "app.routers.ai.settings.OPENAI_API_KEY", "test-provider-key"
        ), patch(
            "app.routers.ai.process_ai_conversation", side_effect=mock_conversation
        ):
            first_chat = self.client.post(
                "/api/ai/chat",
                headers={"X-CSRF-Token": csrf_token},
                json={
                    "message": "I want to rent an apartment",
                    "conversation_id": conversation_id,
                    "user_id": self.other_customer.id,
                    "customer_id": self.other_customer.id,
                },
            )
            self.assertEqual(first_chat.status_code, 200, first_chat.text)
            self.assertEqual(first_chat.json()["conversation_id"], conversation_id)

            interest_chat = self.client.post(
                "/api/ai/chat",
                headers=customer_headers,
                json={
                    "message": "I am interested in this property",
                    "conversation_id": conversation_id,
                    "selected_property_id": 100,
                },
            )
            self.assertEqual(interest_chat.status_code, 200, interest_chat.text)

            visit_chat = self.client.post(
                "/api/ai/chat",
                headers=customer_headers,
                json={"message": "I want a site visit", "conversation_id": conversation_id},
            )
            self.assertEqual(visit_chat.status_code, 200, visit_chat.text)
            visit_response = self.client.post(
                "/api/site-visits",
                headers=customer_headers,
                json={
                    "property_id": 100,
                    "customer_name": "Spoofed Name",
                    "customer_email": "spoofed@example.com",
                    "customer_phone": "+971500000000",
                    "preferred_date": "2030-01-15",
                    "preferred_time": "10:00 AM",
                    "conversation_id": conversation_id,
                    "user_id": self.other_customer.id,
                },
            )
            self.assertEqual(visit_response.status_code, 200, visit_response.text)

            handoff_chat = self.client.post(
                "/api/ai/chat",
                headers=customer_headers,
                json={"message": "Please connect me with an agent", "conversation_id": conversation_id},
            )
            self.assertEqual(handoff_chat.status_code, 200, handoff_chat.text)
            handoff_response = self.client.post(
                "/api/handoff",
                headers=customer_headers,
                json={
                    "customer_name": "Spoofed Name",
                    "customer_phone": "+971500000000",
                    "customer_email": "spoofed@example.com",
                    "requirement_summary": "Callback request",
                    "conversation_id": conversation_id,
                    "interested_property_id": 100,
                    "preferred_language": "en",
                    "requirements": requirements,
                    "user_id": self.other_customer.id,
                    "lead_id": 999999,
                },
            )
            self.assertEqual(handoff_response.status_code, 200, handoff_response.text)

        conversation = self.session.query(Conversation).filter_by(id=conversation_id).one()
        requirement = self.session.query(CustomerRequirement).filter_by(conversation_id=conversation_id).one()
        lead = self.session.query(Lead).filter_by(conversation_id=conversation_id).one()
        visit = self.session.query(SiteVisit).filter_by(id=visit_response.json()["id"]).one()
        handoff = self.session.query(HandoffRequest).filter_by(id=handoff_response.json()["id"]).one()
        self.assertEqual(conversation.user_id, self.customer.id)
        self.assertEqual(requirement.user_id, self.customer.id)
        self.assertEqual(requirement.conversation_id, conversation.id)
        self.assertEqual(lead.customer_id, self.customer.id)
        self.assertEqual(lead.interested_property_id, property_item.id)
        self.assertEqual(visit.user_id, self.customer.id)
        self.assertEqual(visit.lead_id, lead.id)
        self.assertEqual(visit.property_id, property_item.id)
        self.assertEqual(visit.customer_email, self.customer.email)
        self.assertEqual(visit.customer_name, self.customer.full_name)
        self.assertEqual(lead.site_visit_id, visit.id)
        self.assertEqual(handoff.user_id, self.customer.id)
        self.assertEqual(handoff.lead_id, lead.id)
        self.assertEqual(handoff.conversation_id, conversation.id)
        self.assertEqual(handoff.interested_property_id, property_item.id)
        self.assertEqual(handoff.customer_email, self.customer.email)
        self.assertEqual(
            self.session.query(Message).filter_by(conversation_id=conversation_id).count(),
            8,
        )

        other_conversation = Conversation(id="customer-b-workflow", user_id=self.other_customer.id, context_json="{}")
        other_requirement = CustomerRequirement(
            user_id=self.other_customer.id,
            conversation_id=other_conversation.id,
            raw_json='{"purpose":"rent"}',
        )
        other_lead = Lead(
            customer_id=self.other_customer.id,
            customer_name=self.other_customer.full_name,
            customer_email=self.other_customer.email,
            conversation_id=other_conversation.id,
            assigned_employee_id=None,
            lead_status="NEW",
        )
        self.session.add_all([other_conversation, other_requirement, other_lead])
        self.session.flush()
        other_visit = SiteVisit(
            property_id=property_item.id,
            user_id=self.other_customer.id,
            lead_id=other_lead.id,
            customer_name=self.other_customer.full_name,
            customer_email=self.other_customer.email,
            customer_phone="+971511111111",
            preferred_date="2030-01-16",
            preferred_time="11:00 AM",
            status="SCHEDULED",
        )
        other_handoff = HandoffRequest(
            user_id=self.other_customer.id,
            customer_name=self.other_customer.full_name,
            customer_phone="+971511111111",
            customer_email=self.other_customer.email,
            requirement_summary="Customer B request",
            conversation_id=other_conversation.id,
            lead_id=other_lead.id,
            status="PENDING",
        )
        self.session.add_all([other_visit, other_handoff])
        self.session.commit()

        self.assertEqual(len(self.client.get("/api/customer/leads/me", headers=customer_headers).json()), 1)
        customer_conversations = self.client.get("/api/customer/conversations", headers=customer_headers).json()
        self.assertEqual(
            {item["id"] for item in customer_conversations},
            {"owned-chat", conversation_id},
        )
        self.assertEqual(
            len(next(item for item in customer_conversations if item["id"] == conversation_id)["messages"]),
            8,
        )
        self.assertEqual(len(self.client.get("/api/customer/requirements", headers=customer_headers).json()), 1)
        self.assertEqual(len(self.client.get("/api/site-visits/my-visits", headers=customer_headers).json()), 1)
        self.assertEqual(len(self.client.get("/api/customer/handoffs", headers=customer_headers).json()), 1)
        self.assertEqual(self.client.get("/api/customer/conversations", headers=other_headers).json()[0]["id"], other_conversation.id)
        self.assertEqual(
            [item["conversation_id"] for item in self.client.get("/api/customer/handoffs", headers=other_headers).json()],
            [other_conversation.id],
        )
        self.assertEqual(len(self.client.get("/api/customer/requirements", headers=other_headers).json()), 1)
        self.assertEqual(len(self.client.get("/api/site-visits/my-visits", headers=other_headers).json()), 1)
        self.assertEqual(
            self.client.post(
                "/api/site-visits",
                headers=customer_headers,
                json={
                    "property_id": property_item.id,
                    "customer_name": self.customer.full_name,
                    "customer_email": self.customer.email,
                    "customer_phone": "+971500000000",
                    "preferred_date": "2030-01-17",
                    "preferred_time": "12:00 PM",
                    "conversation_id": other_conversation.id,
                },
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/handoff",
                headers=customer_headers,
                json={
                    "customer_name": self.customer.full_name,
                    "customer_phone": "+971500000000",
                    "requirement_summary": "Unauthorized cross-customer request",
                    "conversation_id": other_conversation.id,
                },
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/ai/chat",
                headers=customer_headers,
                json={"message": "read another conversation", "conversation_id": other_conversation.id},
            ).status_code,
            403,
        )

        other_employee = self.add_user("second-employee@example.com", "employee")
        other_lead.assigned_employee_id = other_employee.id
        self.session.commit()
        employee_headers = self.token(self.employee)
        admin_headers = self.token(self.admin)
        self.assertEqual(len(self.client.get("/api/employee/leads", headers=employee_headers).json()), 1)
        self.assertEqual(len(self.client.get("/api/employee/conversations", headers=employee_headers).json()), 1)
        self.assertEqual(len(self.client.get("/api/employee/requirements", headers=employee_headers).json()), 1)
        self.assertEqual(len(self.client.get("/api/site-visits", headers=employee_headers).json()), 1)
        self.assertEqual(len(self.client.get("/api/employee/handoffs", headers=employee_headers).json()), 1)
        self.assertEqual(len(self.client.get("/api/admin/conversations", headers=admin_headers).json()), 3)
        self.assertEqual(len(self.client.get("/api/admin/requirements", headers=admin_headers).json()), 2)
        self.assertEqual(len(self.client.get("/api/site-visits", headers=admin_headers).json()), 2)
        self.assertEqual(len(self.client.get("/api/admin/handoffs", headers=admin_headers).json()), 2)
        self.assertEqual(self.client.get("/api/admin/handoffs", headers=customer_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/admin/handoffs", headers=employee_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/employee/requirements", headers=customer_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/admin/requirements", headers=employee_headers).status_code, 403)
        self.assertEqual(len(self.client.get("/api/customer/leads/me", headers=employee_headers).json()), 0)
        self.assertEqual(len(self.client.get("/api/customer/conversations", headers=admin_headers).json()), 0)

    def test_admin_can_manage_roles_and_property_availability(self):
        role_update = self.client.patch(
            f"/api/admin/users/{self.other_customer.id}/role",
            headers=self.token(self.admin),
            json={"role": "employee"},
        )
        self.assertEqual(role_update.status_code, 200)
        self.assertEqual(role_update.json()["role"], "employee")
        self.assertEqual(
            self.client.patch(
                f"/api/admin/users/{self.admin.id}/role",
                headers=self.token(self.admin),
                json={"role": "customer"},
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.get("/api/admin/properties", headers=self.token(self.customer)).status_code,
            403,
        )
        deactivated = self.client.patch(
            "/api/admin/properties/100/active?is_active=false",
            headers=self.token(self.admin),
        )
        self.assertEqual(deactivated.status_code, 200)
        self.assertFalse(deactivated.json()["is_active"])
        public_property = self.client.get("/api/properties/100")
        self.assertEqual(public_property.status_code, 404)

    def test_employee_cannot_read_or_update_another_employees_lead(self):
        other_employee = self.add_user("second-employee@example.com", "employee")
        lead = Lead(
            customer_id=self.customer.id,
            customer_name=self.customer.full_name,
            customer_email=self.customer.email,
            conversation_id="owned-chat",
            assigned_employee_id=other_employee.id,
            lead_status="NEW",
        )
        self.session.add(lead)
        self.session.commit()
        employee_headers = self.token(self.employee)
        other_employee_headers = self.token(other_employee)

        self.assertEqual(self.client.get("/api/employee/leads", headers=employee_headers).json(), [])
        self.assertEqual(
            self.client.patch(
                f"/api/employee/leads/{lead.id}/status",
                headers=employee_headers,
                json={"status": "CONTACTED"},
            ).status_code,
            404,
        )
        self.assertEqual(len(self.client.get("/api/employee/leads", headers=other_employee_headers).json()), 1)

    def test_unverified_historical_lead_ownership_is_not_rewritten(self):
        conversation = Conversation(id="historical-unverified", user_id=self.customer.id, context_json="{}")
        lead = Lead(
            conversation_id=conversation.id,
            customer_id=None,
            customer_name="Historical record",
            customer_email="historical@example.com",
            lead_status="NEW",
        )
        self.session.add_all([conversation, lead])
        self.session.commit()
        initial_visit_count = self.session.query(SiteVisit).count()
        initial_handoff_count = self.session.query(HandoffRequest).count()
        customer_headers = self.token(self.customer)

        visit_response = self.client.post(
            "/api/site-visits",
            headers=customer_headers,
            json={
                "property_id": 100,
                "customer_name": "Historical record",
                "customer_email": "historical@example.com",
                "customer_phone": "+971500000000",
                "preferred_date": "2030-01-15",
                "preferred_time": "10:00 AM",
                "conversation_id": conversation.id,
            },
        )
        self.assertEqual(visit_response.status_code, 409)
        handoff_response = self.client.post(
            "/api/handoff",
            headers=customer_headers,
            json={
                "customer_name": "Historical record",
                "customer_phone": "+971500000000",
                "requirement_summary": "Historical request",
                "conversation_id": conversation.id,
            },
        )
        self.assertEqual(handoff_response.status_code, 409)
        self.session.expire_all()
        self.assertIsNone(self.session.query(Lead).filter_by(id=lead.id).one().customer_id)
        self.assertEqual(self.session.query(SiteVisit).count(), initial_visit_count)
        self.assertEqual(self.session.query(HandoffRequest).count(), initial_handoff_count)

    def test_login_sets_httponly_cookie_and_csrf_cookie(self):
        response = self.client.post(
            "/api/auth/login",
            json={"email": self.customer.email, "password": "correct-horse-123"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("lyka_access_token", response.cookies)
        self.assertIn("lyka_csrf_token", response.cookies)
        self.assertIsNone(response.json().get("access_token"))

    def test_cookie_mutating_request_requires_csrf_token(self):
        login_res = self.client.post(
            "/api/auth/login",
            json={"email": self.customer.email, "password": "correct-horse-123"},
        )
        self.assertEqual(login_res.status_code, 200)
        valid_csrf = login_res.cookies.get("lyka_csrf_token")

        # Mutating request without CSRF token should be rejected (403 Forbidden)
        no_csrf_res = self.client.patch("/api/auth/profile", json={"full_name": "CSRF Attacker"})
        self.assertEqual(no_csrf_res.status_code, 403)
        self.assertIn("CSRF", no_csrf_res.json()["detail"])

        # Mutating request with invalid CSRF token should also be rejected
        bad_csrf_res = self.client.patch(
            "/api/auth/profile",
            json={"full_name": "CSRF Attacker"},
            headers={"X-CSRF-Token": "invalid-forged-csrf-token"},
        )
        self.assertEqual(bad_csrf_res.status_code, 403)
        self.assertIn("CSRF", bad_csrf_res.json()["detail"])

        # Mutating request with valid CSRF token succeeds
        good_res = self.client.patch(
            "/api/auth/profile",
            json={"full_name": "Updated Customer Name"},
            headers={"X-CSRF-Token": valid_csrf},
        )
        self.assertEqual(good_res.status_code, 200)
        self.assertEqual(good_res.json()["full_name"], "Updated Customer Name")

    def test_bearer_token_authorization_does_not_require_csrf(self):
        headers = self.token(self.customer)
        # Bearer token does not require CSRF header because browsers do not auto-send Authorization headers
        patch_res = self.client.patch(
            "/api/auth/profile",
            json={"full_name": "Bearer Updated Name"},
            headers=headers,
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["full_name"], "Bearer Updated Name")

    def test_logout_clears_auth_and_csrf_cookies(self):
        self.client.post(
            "/api/auth/login",
            json={"email": self.customer.email, "password": "correct-horse-123"},
        )
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)

        logout_res = self.client.post("/api/auth/logout")
        self.assertEqual(logout_res.status_code, 200)

        # After logout, accessing authenticated endpoints via cookies fails with 401
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)


if __name__ == "__main__":
    unittest.main()
