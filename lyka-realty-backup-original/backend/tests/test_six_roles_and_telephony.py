import json
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.user import User
from app.models.property import Property
from app.models.lead import Lead
from app.models.site_visit import SiteVisit
from app.models.audit_log import AuditLog
from app.models.call_record import CallRecord
from app.models.telephony import DoNotCall
from app.routers import auth, crm, visits, ai, properties, telephony
from app.services.auth_service import create_access_token, hash_password


class SixRolesAndTelephonyTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()

        # Setup users for each role
        self.customer = self.create_user("cust@example.com", "customer")
        self.sales_agent = self.create_user("sales@example.com", "sales_agent")
        self.legacy_employee = self.create_user("emp@example.com", "employee")
        self.manager = self.create_user("mgr@example.com", "manager")
        self.admin = self.create_user("adm@example.com", "admin")
        self.super_admin = self.create_user("super@example.com", "super_admin")

        # Setup test property
        self.property = Property(
            id=101,
            title="Marina Gate 2 Bedroom Luxury",
            address="Dubai Marina Walk",
            location="Dubai Marina",
            city="Dubai",
            rent_price=120000.0,
            sale_price=None,
            currency="AED",
            beds=2,
            baths=2,
            property_type="Apartment",
            area_sqft=1250.0,
            furnishing="Furnished",
            purpose="For Rent",
            amenities="[\"Balcony\", \"Gym\", \"Swimming Pool\"]",
            images="[\"https://images.unsplash.com/photo-1545324418-cc1a3fa10c00\"]",
            is_active=True,
        )
        self.session.add(self.property)

        # Setup test lead
        self.lead = Lead(
            id=201,
            customer_name="Test Customer",
            customer_email="cust@example.com",
            customer_phone="+971501234567",
            location="Dubai Marina",
            preferred_location="Dubai Marina",
            bedrooms=2,
            property_type="Apartment",
            intent="rent",
            lead_score=75,
            lead_status="NEW",
            lead_source="AI_CHAT",
            assigned_employee_id=self.sales_agent.id,
        )
        self.session.add(self.lead)
        self.session.commit()

        self.app = FastAPI()
        for router in (auth.router, crm.router, visits.router, ai.router, properties.router, telephony.router):
            self.app.include_router(router, prefix="/api")

        def override_get_db():
            yield self.session

        self.app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.session.close()
        self.engine.dispose()

    def create_user(self, email, role):
        user = User(
            email=email,
            hashed_password=hash_password("Password123!"),
            full_name=f"Test {role.title()}",
            phone="+971500000000",
            role=role,
            is_active=True,
        )
        self.session.add(user)
        self.session.flush()
        return user

    def auth_headers(self, user):
        token = create_access_token({"sub": user.id, "role": user.role})
        return {"Authorization": f"Bearer {token}"}

    def test_lead_is_crm_record_not_login_account(self):
        # Attempting to log in as 'lead' role is explicitly rejected
        res = self.client.post(
            "/api/auth/login",
            json={"email": "cust@example.com", "password": "Password123!", "expected_role": "lead"},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("not a login account", res.json()["detail"])

        # Enquiry status lookup by phone functions properly for tracking
        res_lookup = self.client.get("/api/leads/enquiry-status?phone=+971501234567")
        self.assertEqual(res_lookup.status_code, 200)
        data = res_lookup.json()
        self.assertTrue(data["found"])
        self.assertEqual(len(data["leads"]), 1)
        self.assertEqual(data["leads"][0]["id"], 201)

    def test_customer_self_registration_cannot_elevate_role(self):
        res = self.client.post(
            "/api/auth/register",
            json={
                "email": "newbie@example.com",
                "password": "Password123!",
                "full_name": "New Customer",
                "phone": "+971509998877",
            },
        )
        self.assertEqual(res.status_code, 200)
        user_data = res.json()["user"]
        self.assertEqual(user_data["role"], "customer")

    def test_sales_agent_and_legacy_employee_can_access_leads_and_override_score(self):
        # Sales agent can view leads
        res = self.client.get("/api/employee/leads", headers=self.auth_headers(self.sales_agent))
        self.assertEqual(res.status_code, 200)
        self.assertTrue(len(res.json()) >= 1)

        # Legacy employee can also view leads
        res_emp = self.client.get("/api/employee/leads", headers=self.auth_headers(self.legacy_employee))
        self.assertEqual(res_emp.status_code, 200)

        # Customer cannot view employee leads
        res_cust = self.client.get("/api/employee/leads", headers=self.auth_headers(self.customer))
        self.assertEqual(res_cust.status_code, 403)

        # Sales agent can override lead score with explanation
        res_score = self.client.post(
            f"/api/employee/leads/{self.lead.id}/score-override",
            headers=self.auth_headers(self.sales_agent),
            json={"new_score": 90, "reason": "High net-worth client confirmed ready to close this week"},
        )
        self.assertEqual(res_score.status_code, 200)
        updated = res_score.json()
        self.assertEqual(updated["lead_score"], 90)
        self.assertTrue(updated["score_override"])
        self.assertIn("High net-worth", updated["score_override_reason"])

    def test_manager_pipeline_and_lead_reassignment(self):
        # Manager can access manager pipeline
        res_pipe = self.client.get("/api/manager/pipeline", headers=self.auth_headers(self.manager))
        self.assertEqual(res_pipe.status_code, 200)
        self.assertIn("conversion_rate", res_pipe.json())
        self.assertIn("status_breakdown", res_pipe.json())

        # Sales agent cannot access manager pipeline
        res_forbidden = self.client.get("/api/manager/pipeline", headers=self.auth_headers(self.sales_agent))
        self.assertEqual(res_forbidden.status_code, 403)

        # Manager can reassign lead
        res_reassign = self.client.post(
            "/api/manager/leads/reassign",
            headers=self.auth_headers(self.manager),
            params={"lead_id": self.lead.id},
            json={"employee_id": self.legacy_employee.id},
        )
        self.assertEqual(res_reassign.status_code, 200)
        self.assertEqual(res_reassign.json()["assigned_employee_id"], self.legacy_employee.id)

    def test_admin_and_super_admin_privilege_isolation(self):
        # Admin can view admin stats
        res_stats = self.client.get("/api/admin/stats", headers=self.auth_headers(self.admin))
        self.assertEqual(res_stats.status_code, 200)

        # Admin can view audit logs
        res_logs = self.client.get("/api/admin/audit-logs", headers=self.auth_headers(self.admin))
        self.assertEqual(res_logs.status_code, 200)

        # Admin cannot access super_admin-only endpoints
        res_forbidden = self.client.get("/api/super-admin/platform-config", headers=self.auth_headers(self.admin))
        self.assertEqual(res_forbidden.status_code, 403)

        # Super admin can access super_admin-only endpoints
        res_super = self.client.get("/api/super-admin/platform-config", headers=self.auth_headers(self.super_admin))
        self.assertEqual(res_super.status_code, 200)
        self.assertIn("security_features", res_super.json())

    def test_ai_calling_agent_initiates_call_and_respects_dnc(self):
        # Outbound call initiation by sales agent
        res_call = self.client.post(
            "/api/telephony/calls",
            headers=self.auth_headers(self.sales_agent),
            json={"phone": "+971501234567", "lead_id": self.lead.id, "customer_name": "Test Customer"},
        )
        self.assertEqual(res_call.status_code, 200)
        call_data = res_call.json()
        self.assertTrue(call_data["success"])
        self.assertIn("mock_call_", call_data["call_sid"])
        self.assertEqual(call_data["status"], "completed")
        self.assertEqual(call_data["outcome"], "CALLBACK_REQUESTED")

        # Add number to Do-Not-Call (DNC) list
        res_dnc = self.client.post(
            "/api/telephony/dnc",
            headers=self.auth_headers(self.sales_agent),
            json={"phone": "+971501234567", "reason": "Customer requested no phone calls"},
        )
        self.assertEqual(res_dnc.status_code, 200)

        # Subsequent call attempt must be rejected due to DNC
        res_blocked = self.client.post(
            "/api/telephony/calls",
            headers=self.auth_headers(self.sales_agent),
            json={"phone": "+971501234567", "lead_id": self.lead.id},
        )
        self.assertEqual(res_blocked.status_code, 400)
        self.assertIn("Do-Not-Call", res_blocked.json()["detail"])

    def test_viewing_appointment_booking_and_lifecycle(self):
        # Customer requests site visit
        res_visit = self.client.post(
            "/api/site-visits",
            headers=self.auth_headers(self.customer),
            json={
                "property_id": self.property.id,
                "customer_name": "Test Customer",
                "customer_email": "cust@example.com",
                "customer_phone": "+971501234567",
                "preferred_date": "2026-11-20",
                "preferred_time": "14:00",
                "notes": "Prefers afternoon slot",
            },
        )
        self.assertEqual(res_visit.status_code, 200)
        visit_data = res_visit.json()
        visit_id = visit_data["id"]
        # Initial status is REQUESTED (never falsely marked CONFIRMED before agent action)
        self.assertEqual(visit_data["status"], "REQUESTED")

        # Duplicate viewing submission on the same date is prevented
        res_duplicate = self.client.post(
            "/api/site-visits",
            headers=self.auth_headers(self.customer),
            json={
                "property_id": self.property.id,
                "customer_name": "Test Customer",
                "customer_email": "cust@example.com",
                "customer_phone": "+971501234567",
                "preferred_date": "2026-11-20",
                "preferred_time": "14:00",
            },
        )
        self.assertEqual(res_duplicate.status_code, 409)

        # Sales agent confirms appointment and adds notes
        res_confirm = self.client.patch(
            f"/api/site-visits/{visit_id}/status",
            headers=self.auth_headers(self.sales_agent),
            json={
                "status": "CONFIRMED",
                "assigned_agent_id": self.sales_agent.id,
                "confirmation_notes": "Key retrieved from building reception; confirmed with tenant",
            },
        )
        self.assertEqual(res_confirm.status_code, 200)
        self.assertEqual(res_confirm.json()["status"], "CONFIRMED")
        self.assertEqual(res_confirm.json()["assigned_agent_id"], self.sales_agent.id)
