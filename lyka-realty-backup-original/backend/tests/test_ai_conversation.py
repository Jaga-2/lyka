import unittest
from unittest.mock import Mock, patch

import httpx
from openai import OpenAI, RateLimitError
from google.genai import errors as genai_errors
from fastapi import HTTPException

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.conversation import Conversation, Message
from app.models.lead import Lead
from app.models.property import Property
from app.models.site_visit import HandoffRequest, SiteVisit
from app.models.user import User
from app.routers.ai import ai_chat
from app.routers.crm import get_leads
from app.routers.visits import create_handoff, create_site_visit
from app.schemas.ai import AIChatRequest
from app.schemas.crm import HandoffCreateRequest, SiteVisitCreateRequest
from app.services.ai_service import extract_structured_requirements_heuristics, stream_ai_conversation


class AIConversationTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        self.session = sessionmaker(bind=engine)()
        self.session.add_all(
            [
                Property(
                    id=2416,
                    title="Palm Residence 3 Bedroom",
                    address="Palm Jumeirah",
                    location="Palm Jumeirah",
                    city="Dubai",
                    rent_price=500_000,
                    beds=3,
                    baths=3,
                    property_type="Apartment",
                    area_sqft=1800,
                    furnishing="Furnished",
                    purpose="For Rent",
                    amenities="[]",
                    images="[]",
                ),
                Property(
                    id=2494,
                    title="Palm Garden 3 Bedroom",
                    address="Palm Jumeirah",
                    location="Palm Jumeirah",
                    city="Dubai",
                    rent_price=700_000,
                    beds=3,
                    baths=2,
                    property_type="Apartment",
                    area_sqft=1600,
                    furnishing="Unfurnished",
                    purpose="For Rent",
                    amenities="[]",
                    images="[]",
                ),
                Property(
                    id=2538,
                    title="Palm View 3 Bedroom",
                    address="Palm Jumeirah",
                    location="Palm Jumeirah",
                    city="Dubai",
                    rent_price=900_000,
                    beds=3,
                    baths=3,
                    property_type="Villa",
                    area_sqft=2200,
                    furnishing="Furnished",
                    purpose="For Rent",
                    amenities="[]",
                    images="[]",
                ),
            ]
        )
        self.user = User(
            email="test@example.com",
            hashed_password="not-used",
            full_name="Test Customer",
            role="customer",
            is_active=True,
        )
        self.session.add(self.user)
        self.session.commit()
        self.engine = engine
        self.openai_response = Mock()
        self.openai_response.choices = [Mock(message=Mock(content="Mocked provider response"))]
        self.openai_client = Mock()
        self.openai_client.chat.completions.create.return_value = self.openai_response
        self.key_patch = patch("app.services.ai_service.settings.OPENAI_API_KEY", "test-provider-key")
        self.provider_selection_patch = patch("app.services.ai_service.settings.AI_PROVIDER", "openai")
        self.provider_patch = patch("app.services.ai_service.openai.OpenAI", return_value=self.openai_client)
        self.key_patch.start()
        self.provider_selection_patch.start()
        self.provider_patch.start()

    def tearDown(self):
        self.provider_patch.stop()
        self.provider_selection_patch.stop()
        self.key_patch.stop()
        self.session.close()
        self.engine.dispose()

    def chat(self, text, conversation_id="test-conversation", **kwargs):
        return ai_chat(
            AIChatRequest(message=text, conversation_id=conversation_id, **kwargs),
            self.session,
            self.user,
        )

    def test_openai_client_initializes_with_the_installed_http_client(self):
        client = OpenAI(api_key="local-compatibility-probe-not-a-real-key")
        client.close()

    def test_gemini_provider_uses_database_facts_and_existing_chat_context(self):
        gemini_response = Mock()
        gemini_response.text = "Gemini property response"
        gemini_client = Mock()
        gemini_client.models.generate_content.return_value = gemini_response
        with patch("app.services.ai_service.settings.AI_PROVIDER", "gemini"), patch(
            "app.services.ai_service.settings.GEMINI_API_KEY", "test-gemini-key"
        ), patch("app.services.ai_service.genai.Client", return_value=gemini_client) as client_factory:
            first = self.chat("Find a 3 BHK in Palm Jumeirah", "gemini-chat")
            second = self.chat("Can I see cheaper ones?", "gemini-chat")

        self.assertEqual(second.response, "Gemini property response")
        self.assertEqual(second.action_type, "search")
        self.assertEqual([item.id for item in second.properties], [2416, 2494])
        request = gemini_client.models.generate_content.call_args
        self.assertEqual(request.kwargs["model"], "gemini-flash-latest")
        self.assertIn("Palm Residence 3 Bedroom", request.kwargs["config"].system_instruction)
        self.assertEqual(request.kwargs["contents"][0].role, "user")
        self.assertTrue(any(item.role == "model" for item in request.kwargs["contents"]))
        self.assertEqual(first.conversation_id, second.conversation_id)
        self.assertEqual(client_factory.call_args.kwargs["http_options"].retry_options.attempts, 1)

    def test_chat_reuses_property_context_without_a_second_property_query(self):
        self.session.add(
            Conversation(
                id="property-query-chat",
                user_id=self.user.id,
                context_json='{"current_property_id": 2416}',
            )
        )
        self.session.commit()
        property_selects = []

        def capture_property_select(_conn, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith("SELECT") and "from properties" in statement.lower():
                property_selects.append(statement)

        event.listen(self.engine, "before_cursor_execute", capture_property_select)
        try:
            self.chat("Hello", "property-query-chat")
        finally:
            event.remove(self.engine, "before_cursor_execute", capture_property_select)

        self.assertEqual(len(property_selects), 1)

    def test_missing_gemini_key_does_not_create_conversation_or_messages(self):
        with patch("app.services.ai_service.settings.AI_PROVIDER", "gemini"), patch(
            "app.services.ai_service.settings.GEMINI_API_KEY", ""
        ), patch("app.services.ai_service.settings.OPENAI_API_KEY", ""):
            with self.assertRaises(HTTPException) as raised:
                self.chat("Find a rental in Dubai Marina", "unconfigured-gemini-chat")

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("GEMINI_API_KEY", raised.exception.detail)
        self.assertIsNone(
            self.session.query(Conversation).filter_by(id="unconfigured-gemini-chat").first()
        )
        self.assertEqual(
            self.session.query(Message).filter_by(conversation_id="unconfigured-gemini-chat").count(),
            0,
        )

    def test_gemini_quota_errors_are_not_retried_or_saved(self):
        class GeminiQuotaError(Exception):
            code = 429
            message = "Gemini quota exceeded; billing required"

        gemini_client = Mock()
        gemini_client.models.generate_content.side_effect = GeminiQuotaError("private provider message")
        with patch("app.services.ai_service.settings.AI_PROVIDER", "gemini"), patch(
            "app.services.ai_service.settings.GEMINI_API_KEY", "test-gemini-key"
        ), patch("app.services.ai_service.settings.OPENAI_API_KEY", ""), patch(
            "app.services.ai_service.genai.Client", return_value=gemini_client
        ), patch(
            "app.services.ai_service.time.sleep"
        ) as sleep:
            with self.assertRaises(HTTPException) as raised:
                self.chat("Find a rental in Dubai Marina", "gemini-quota-chat")

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("quota or a billing limit", raised.exception.detail)
        self.assertNotIn("private provider message", raised.exception.detail)
        self.assertEqual(gemini_client.models.generate_content.call_count, 1)
        sleep.assert_not_called()
        self.assertIsNone(self.session.query(Conversation).filter_by(id="gemini-quota-chat").first())
        self.assertEqual(
            self.session.query(Message).filter_by(conversation_id="gemini-quota-chat").count(),
            0,
        )

    def test_gemini_unavailable_errors_are_reported_as_temporary_without_retries_or_saves(self):
        class GeminiUnavailableError(Exception):
            code = 503
            status = "UNAVAILABLE"
            message = "Temporary provider outage"

        gemini_client = Mock()
        gemini_client.models.generate_content.side_effect = GeminiUnavailableError(
            "private provider message"
        )
        with patch("app.services.ai_service.settings.AI_PROVIDER", "gemini"), patch(
            "app.services.ai_service.settings.GEMINI_API_KEY", "test-gemini-key"
        ), patch("app.services.ai_service.settings.OPENAI_API_KEY", ""), patch(
            "app.services.ai_service.genai.Client", return_value=gemini_client
        ), patch(
            "app.services.ai_service.time.sleep"
        ) as sleep:
            with self.assertRaises(HTTPException) as raised:
                self.chat("Find a rental in Dubai Marina", "gemini-unavailable-chat")

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("temporarily unavailable", raised.exception.detail)
        self.assertNotIn("private provider message", raised.exception.detail)
        self.assertEqual(gemini_client.models.generate_content.call_count, 1)
        sleep.assert_not_called()
        self.assertIsNone(
            self.session.query(Conversation).filter_by(id="gemini-unavailable-chat").first()
        )
        self.assertEqual(
            self.session.query(Message)
            .filter_by(conversation_id="gemini-unavailable-chat")
            .count(),
            0,
        )

    def test_gemini_invalid_key_and_missing_model_errors_are_distinguished(self):
        invalid_key = genai_errors.ClientError(
            code=400,
            response_json={
                "error": {
                    "status": "INVALID_ARGUMENT",
                    "message": "API key not valid. Please pass a valid API key.",
                }
            },
        )
        missing_model = genai_errors.ClientError(
            code=404,
            response_json={
                "error": {
                    "status": "NOT_FOUND",
                    "message": "Requested Gemini model was not found.",
                }
            },
        )
        gemini_client = Mock()
        gemini_client.models.generate_content.side_effect = [invalid_key, missing_model]
        with patch("app.services.ai_service.settings.AI_PROVIDER", "gemini"), patch(
            "app.services.ai_service.settings.GEMINI_API_KEY", "test-gemini-key"
        ), patch("app.services.ai_service.settings.OPENAI_API_KEY", ""), patch(
            "app.services.ai_service.genai.Client", return_value=gemini_client
        ):
            for conversation_id, expected_status, expected_detail in (
                ("gemini-invalid-key", 503, "credentials were rejected"),
                ("gemini-missing-model", 502, "model was not found"),
            ):
                with self.subTest(conversation_id=conversation_id):
                    with self.assertRaises(HTTPException) as raised:
                        self.chat("Find a rental in Dubai Marina", conversation_id)
                    self.assertEqual(raised.exception.status_code, expected_status)
                    self.assertIn(expected_detail, raised.exception.detail)

    def test_openai_rate_limit_retries_once_and_succeeds(self):
        response = httpx.Response(
            429,
            request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
        )
        rate_limit_error = RateLimitError(
            "temporary rate limit",
            response=response,
            body={"type": "rate_limit_exceeded", "code": "rate_limit_exceeded"},
        )
        self.openai_client.chat.completions.create.side_effect = [
            rate_limit_error,
            self.openai_response,
        ]

        with patch("app.services.ai_service.time.sleep") as sleep:
            result = self.chat("Find a 3 BHK in Palm Jumeirah", "rate-limit-retry")

        self.assertEqual(result.response, "Mocked provider response")
        self.assertEqual(self.openai_client.chat.completions.create.call_count, 2)
        sleep.assert_called_once()

    def test_openai_transient_retries_are_bounded(self):
        response = httpx.Response(
            429,
            request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
        )
        rate_limit_error = RateLimitError(
            "temporary rate limit",
            response=response,
            body={"type": "rate_limit_exceeded", "code": "rate_limit_exceeded"},
        )
        self.openai_client.chat.completions.create.side_effect = [rate_limit_error] * 4

        with patch("app.services.ai_service.time.sleep") as sleep:
            with self.assertRaises(HTTPException) as raised:
                self.chat("Find a rental in Dubai Marina", "bounded-retry")

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(self.openai_client.chat.completions.create.call_count, 3)
        self.assertEqual(sleep.call_count, 2)
        self.assertIsNone(self.session.query(Conversation).filter_by(id="bounded-retry").first())

    def test_provider_auth_model_timeout_and_network_errors_are_classified_safely(self):
        class ProviderError(Exception):
            def __init__(self, code, message="private provider detail"):
                super().__init__(message)
                self.status_code = code

        cases = (
            (ProviderError(401), "credentials were rejected"),
            (ProviderError(404), "model was not found"),
            (ProviderError(400), "rejected the request"),
            (httpx.TimeoutException("private timeout detail"), "timed out"),
            (
                httpx.ConnectError(
                    "private network detail",
                    request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
                ),
                "could not connect",
            ),
        )
        for error, expected_detail in cases:
            with self.subTest(error_type=type(error).__name__):
                self.openai_client.chat.completions.create.side_effect = error
                with self.assertRaises(HTTPException) as raised:
                    self.chat("Find a rental in Dubai Marina", f"error-{type(error).__name__}")
                self.assertIn(expected_detail, raised.exception.detail)
                self.assertNotIn(str(error), raised.exception.detail)

    def test_budget_units_and_maximum_phrasing(self):
        current = extract_structured_requirements_heuristics("I want a 3 BHK in Palm Jumeirah", {})
        self.assertEqual(current["bedrooms"], 3)
        self.assertEqual(current["location"], "Palm Jumeirah")
        one_point_two_million = extract_structured_requirements_heuristics("1.2 million dirhams", current)
        self.assertEqual(one_point_two_million["budget_target"], 1_200_000)
        under_two_million = extract_structured_requirements_heuristics("under 2 million dirhams", current)
        self.assertEqual(under_two_million["budget_max"], 2_000_000)
        self.assertEqual(extract_structured_requirements_heuristics("120k", {})["budget_target"], 120_000)
        self.assertEqual(extract_structured_requirements_heuristics("1 crore", {})["budget_target"], 10_000_000)
        self.assertEqual(extract_structured_requirements_heuristics("1.5 crore", {})["budget_target"], 15_000_000)

    def test_requirement_context_survives_budget_and_furnishing_followups(self):
        initial = self.chat("I want a 3 BHK in Palm Jumeirah")
        self.assertEqual(initial.extracted_requirements["bedrooms"], 3)
        budget = self.chat("1.2 million dirhams")
        self.assertEqual(budget.extracted_requirements["budget_target"], 1_200_000)
        self.assertEqual(budget.extracted_requirements["location"], "Palm Jumeirah")
        self.assertEqual(budget.extracted_requirements["bedrooms"], 3)
        capped = self.chat("under 2 million dirhams")
        self.assertEqual(capped.extracted_requirements["budget_max"], 2_000_000)
        furnished = self.chat("Only furnished properties")
        self.assertEqual(furnished.extracted_requirements["furnished"], True)
        self.assertEqual(furnished.extracted_requirements["location"], "Palm Jumeirah")
        self.assertEqual(furnished.extracted_requirements["bedrooms"], 3)
        self.assertTrue(all(item.furnishing == "Furnished" for item in furnished.properties))
        self.assertEqual(self.session.query(Lead).filter(Lead.conversation_id == "test-conversation").count(), 1)

    def test_cheaper_refines_the_previous_result_set(self):
        self.chat("I want a 3 BHK in Palm Jumeirah")
        response = self.chat("Show cheaper ones", selected_property_id=2538)
        self.assertEqual(response.action_type, "search")
        self.assertEqual([item.id for item in response.properties], [2416, 2494])

    def test_property_reference_answers_about_the_selected_database_record(self):
        response = self.chat("இந்த property நல்லதா?", selected_property_id=2494)
        self.assertEqual(response.action_type, "details")
        self.assertEqual(response.properties[0].id, 2494)
        system = self.openai_client.chat.completions.create.call_args.kwargs["messages"][0]["content"]
        self.assertIn("Palm Garden 3 Bedroom", system)
        price_answer = self.chat("இதோட rent எவ்வளவு?")
        price_system = self.openai_client.chat.completions.create.call_args.kwargs["messages"][0]["content"]
        self.assertEqual(price_answer.response, "Mocked provider response")
        self.assertIn("700000.0", price_system)

    def test_comparison_and_unavailable_property_facts_use_real_inventory(self):
        self.chat("I want a 3 BHK in Palm Jumeirah")
        compared = self.chat("Which one is better?")
        self.assertEqual(compared.action_type, "compare")
        self.assertEqual({prop.id for prop in compared.properties}, {2416, 2494, 2538})
        unavailable = self.chat("Is there a metro nearby?", selected_property_id=2416)
        system = self.openai_client.chat.completions.create.call_args.kwargs["messages"][0]["content"]
        self.assertIn("Do not invent facts", system)
        self.assertIn('"amenities": "[]"', system)

    def test_buy_search_does_not_return_rental_listings(self):
        response = self.chat("I want to buy a 3 BHK in Palm Jumeirah", "buy-search")
        self.assertEqual(response.properties, [])
        system = self.openai_client.chat.completions.create.call_args.kwargs["messages"][0]["content"]
        self.assertIn("Database facts: []", system)

    def test_tamil_and_tanglish_intents_are_detected(self):
        tamil = self.chat("எனக்கு 2 BHK Dubai Marina-ல வேண்டும்.", "tamil-chat")
        self.assertEqual(tamil.extracted_requirements["bedrooms"], 2)
        self.assertEqual(tamil.extracted_requirements["location"], "Dubai Marina")
        self.assertEqual(tamil.language, "mixed")
        tanglish = self.chat("Enakku Dubai Marina la 2 BHK venum.", "tanglish-chat")
        self.assertEqual(tanglish.extracted_requirements["bedrooms"], 2)
        self.assertEqual(tanglish.extracted_requirements["location"], "Dubai Marina")
        self.assertEqual(tanglish.language, "tanglish")

    def test_site_visit_persists_and_links_to_the_conversation_lead(self):
        self.chat("I want a 3 BHK in Palm Jumeirah")
        requested = self.chat("இந்த வீட்டை பார்க்கணும்", selected_property_id=2416)
        self.assertEqual(requested.action_type, "site_visit")
        visit = create_site_visit(
            SiteVisitCreateRequest(
                property_id=2416,
                customer_name="Test Customer",
                customer_email="test@example.com",
                customer_phone="+971500000000",
                preferred_date="2030-01-15",
                preferred_time="10:00 AM",
                conversation_id=requested.conversation_id,
            ),
            self.session,
            self.user,
        )
        saved_visit = self.session.query(SiteVisit).filter(SiteVisit.id == visit.id).one()
        lead = self.session.query(Lead).filter(Lead.conversation_id == requested.conversation_id).one()
        self.assertEqual(saved_visit.lead_id, lead.id)
        self.assertEqual(lead.site_visit_id, saved_visit.id)
        self.assertEqual(lead.lead_status, "SITE_VISIT")
        crm_lead = get_leads(None, self.session, self.user)[0]
        self.assertEqual(crm_lead.interested_property["title"], "Palm Residence 3 Bedroom")
        self.assertEqual(crm_lead.site_visit.id, saved_visit.id)
        self.assertTrue(crm_lead.recent_conversation)

    def test_handoff_upserts_one_lead_and_one_request(self):
        response = self.chat("I want to talk to an agent", "agent-chat")
        self.assertEqual(response.action_type, "handoff")
        lead = self.session.query(Lead).filter(Lead.conversation_id == "agent-chat").one()
        request = self.session.query(HandoffRequest).filter(HandoffRequest.conversation_id == "agent-chat").one()
        self.assertEqual(lead.lead_status, "CONTACTED")
        self.assertEqual(request.status, "NEEDS_CONTACT")
        body = HandoffCreateRequest(
            customer_name="Test Customer",
            customer_phone="+971500000000",
            requirement_summary="Callback requested",
            conversation_id="agent-chat",
            preferred_language="en",
            requirements={"purpose": "rent", "location": "Dubai Marina"},
        )
        saved = create_handoff(body, self.session, self.user)
        self.assertEqual(saved["id"], request.id)
        self.assertEqual(self.session.query(Lead).filter(Lead.conversation_id == "agent-chat").count(), 1)
        self.assertEqual(self.session.query(HandoffRequest).filter(HandoffRequest.conversation_id == "agent-chat").count(), 1)

    def test_speech_failure_is_reported_without_fabricating_audio(self):
        with patch("app.routers.ai._create_speech", return_value=(None, "Speech service unavailable")):
            response = self.chat("இந்த property நல்லதா?", "tamil-voice", selected_property_id=2416, synthesize_audio=True)
        self.assertIsNone(response.audio_base64)
        self.assertEqual(response.audio_error, "Speech service unavailable")
        english = self.chat("Is this property good?", "english-voice", selected_property_id=2416)
        self.assertEqual(english.language, "en")

    def test_chat_returns_service_unavailable_without_openai_configuration(self):
        with patch("app.routers.ai.settings.OPENAI_API_KEY", ""):
            with self.assertRaises(HTTPException) as raised:
                self.chat("Hi", "unconfigured-chat")
        self.assertEqual(raised.exception.status_code, 503)
        self.assertIsNone(self.session.query(Conversation).filter(Conversation.id == "unconfigured-chat").first())

    def test_insufficient_provider_quota_is_reported_without_saving_failed_chat(self):
        response = httpx.Response(
            429,
            request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
        )
        quota_error = RateLimitError(
            "provider error message must not be logged or returned",
            response=response,
            body={"type": "insufficient_quota", "code": "credit_balance_exhausted"},
        )
        self.openai_client.chat.completions.create.side_effect = quota_error

        with self.assertLogs("app.services.ai_service", level="ERROR") as captured_logs:
            with self.assertRaises(HTTPException) as raised:
                self.chat("Find a rental in Dubai Marina", "quota-chat")

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("insufficient quota", raised.exception.detail)
        self.assertNotIn("provider error message", raised.exception.detail)
        self.assertNotIn("provider error message", "\n".join(captured_logs.output))
        self.assertIn("credit_balance_exhausted", "\n".join(captured_logs.output))
        self.assertIsNone(self.session.query(Conversation).filter(Conversation.id == "quota-chat").first())
        self.assertEqual(self.session.query(Message).filter(Message.conversation_id == "quota-chat").count(), 0)
        self.assertEqual(self.session.query(Lead).filter(Lead.conversation_id == "quota-chat").count(), 0)

    def test_streaming_ai_chat_yields_events(self):
        chunk1 = Mock(choices=[Mock(delta=Mock(content="Hello "))])
        chunk2 = Mock(choices=[Mock(delta=Mock(content="world!"))])
        self.openai_client.chat.completions.create.return_value = [chunk1, chunk2]

        token_generator, props, reqs, action = stream_ai_conversation(
            db=self.session,
            message="Find a 3 BHK in Palm Jumeirah",
            history=[],
            current_requirements={},
        )
        tokens = list(token_generator)
        self.assertEqual("".join(tokens), "Hello world!")
        self.assertEqual(action, "search")
        self.assertTrue(len(props) > 0)


if __name__ == "__main__":
    unittest.main()
