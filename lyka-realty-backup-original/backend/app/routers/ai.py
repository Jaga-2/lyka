import base64
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import openai
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal, get_db
from ..models.conversation import Conversation, CustomerRequirement, Message
from ..models.lead import Lead
from ..models.property import Property
from ..models.site_visit import HandoffRequest
from ..models.user import User
from ..schemas.ai import AIChatRequest, AIChatResponse
from ..services.ai_service import _provider_failure, process_ai_conversation, stream_ai_conversation, provider_configuration_error
from ..services.lead_scoring_service import calculate_explainable_lead_score
from ..services.auth_service import require_auth
from .properties import to_response_dto

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI Consultant"])


def _make_lead_summary(requirements: Dict[str, Any], property_item: Optional[Property], action: str) -> str:
    parts = []
    purpose = requirements.get("purpose")
    if purpose:
        parts.append("Interested in " + ("buying" if purpose == "buy" else "renting"))
    bedrooms = requirements.get("bedrooms")
    if bedrooms is not None:
        parts.append(f"{bedrooms} bedroom requirement")
    budget = requirements.get("budget_target")
    if budget is not None:
        parts.append(f"Budget target AED {budget:,.0f}")
    if requirements.get("budget_min") is not None:
        parts.append(f"Minimum AED {requirements['budget_min']:,.0f}")
    if requirements.get("budget_max") is not None:
        parts.append(f"Maximum AED {requirements['budget_max']:,.0f}")
    if requirements.get("location"):
        parts.append(f"Preferred location: {requirements['location']}")
    if requirements.get("property_type"):
        parts.append(f"Property type: {requirements['property_type']}")
    if property_item:
        parts.append(f"Interested property: {property_item.title} (ID {property_item.id})")
    if action == "site_visit":
        parts.append("Site visit requested; date and time not yet confirmed")
    if action == "agent":
        parts.append("Requested contact from a LYKA Realty advisor")
    return "; ".join(parts) or "Customer started a property consultation."


def _upsert_conversation_lead(
    db: Session,
    conversation_id: str,
    requirements: Dict[str, Any],
    action: str,
    current_user: User,
    property_item: Optional[Property],
) -> Optional[Lead]:
    has_signal = any(
        (
            requirements.get("purpose"),
            requirements.get("buy_or_rent"),
            requirements.get("budget_target"),
            requirements.get("location"),
            requirements.get("bedrooms") is not None,
            requirements.get("property_type"),
            property_item,
            action in {"site_visit", "agent"},
        )
    )
    if not has_signal:
        return None

    leads = db.query(Lead).filter(Lead.conversation_id == conversation_id).all()
    if len(leads) > 1:
        raise HTTPException(status_code=409, detail="This conversation has conflicting lead records")
    lead = leads[0] if leads else None
    if lead is not None and lead.customer_id != current_user.id:
        raise HTTPException(status_code=409, detail="The existing lead ownership for this conversation cannot be verified")
    if not lead:
        lead = Lead(
            conversation_id=conversation_id,
            customer_id=current_user.id,
            customer_name=current_user.full_name,
            customer_email=current_user.email,
            customer_phone=current_user.phone,
            lead_status="NEW",
        )
        db.add(lead)
    lead.customer_id = current_user.id

    score, _, factors = calculate_explainable_lead_score(
        requirements,
        has_site_visit=action == "site_visit",
        phone_present=bool(current_user.phone),
        interested_property=property_item is not None,
        agent_request=action == "agent",
    )
    lead.intent = requirements.get("purpose") or requirements.get("buy_or_rent")
    lead.budget = requirements.get("budget_target")
    lead.budget_min = requirements.get("budget_min")
    lead.budget_max = requirements.get("budget_max")
    lead.location = requirements.get("location")
    lead.preferred_location = requirements.get("location")
    lead.bedrooms = requirements.get("bedrooms")
    lead.property_type = requirements.get("property_type")
    lead.furnished = None if requirements.get("furnished") is None else int(bool(requirements["furnished"]))
    lead.interested_property_id = property_item.id if property_item else lead.interested_property_id
    lead.preferred_language = requirements.get("language")
    lead.timeline = requirements.get("timeline")
    lead.lead_score = score
    lead.score_factors = json.dumps(factors)
    lead.requirements_summary = json.dumps(requirements, ensure_ascii=False)
    lead.conversation_summary = _make_lead_summary(requirements, property_item, action)
    lead.lead_status = "CONTACTED" if action == "agent" else "SITE_VISIT" if action == "site_visit" else "QUALIFIED" if score >= 30 else "NEW"
    db.flush()
    return lead


def _upsert_handoff(
    db: Session,
    conversation_id: str,
    requirements: Dict[str, Any],
    lead: Lead,
    current_user: User,
    property_item: Optional[Property],
) -> None:
    handoffs = (
        db.query(HandoffRequest)
        .filter(HandoffRequest.conversation_id == conversation_id)
        .all()
    )
    if len(handoffs) > 1:
        raise HTTPException(status_code=409, detail="This conversation has conflicting handoff records")
    handoff = handoffs[0] if handoffs else None
    if handoff is not None and handoff.user_id != current_user.id:
        raise HTTPException(status_code=409, detail="The existing handoff ownership for this conversation cannot be verified")
    if handoff is None:
        handoff = HandoffRequest(
            conversation_id=conversation_id,
            customer_name=current_user.full_name,
            customer_phone=current_user.phone or "",
            customer_email=current_user.email,
            status="PENDING" if current_user.phone else "NEEDS_CONTACT",
            user_id=current_user.id,
        )
        db.add(handoff)
    handoff.requirement_summary = _make_lead_summary(requirements, property_item, "agent")
    handoff.lead_id = lead.id
    handoff.interested_property_id = property_item.id if property_item else None
    handoff.preferred_language = requirements.get("language")
    handoff.user_id = current_user.id


def _create_speech(reply: str, language: str) -> Tuple[Optional[str], Optional[str]]:
    if not settings.OPENAI_API_KEY.strip():
        return None, "Speech generation is unavailable: OPENAI_API_KEY is not configured on the backend."
    try:
        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        language_hint = "Tamil" if language in {"ta", "mixed", "tanglish"} else "English"
        audio = client.audio.speech.create(
            model=settings.OPENAI_TTS_MODEL,
            voice=settings.OPENAI_TTS_VOICE,
            input=reply,
            instructions=f"Speak naturally and clearly in {language_hint}. Preserve the pronunciation of Dubai property names.",
            response_format="mp3",
        )
        return base64.b64encode(audio.content).decode("ascii"), None
    except Exception as error:
        provider_error = _provider_failure(error, operation="speech", provider="openai")
        return None, provider_error.detail


def _save_conversation_turn(
    db: Session,
    conv_id: str,
    conv: Conversation,
    current_user: User,
    reply: str,
    props: List[Property],
    updated_reqs: Dict[str, Any],
    action_type: str,
    context: Dict[str, Any],
    selected_property_id: Optional[int] = None,
    message_text: str = "",
) -> None:
    if action_type in {"search", "compare"} and props:
        context["shown_property_ids"] = [prop.id for prop in props]
        if action_type == "search" or context.get("current_property_id") not in context["shown_property_ids"]:
            context["current_property_id"] = props[0].id
        if action_type == "search":
            context["current_property_selected"] = False
    property_interest = bool(
        context.get("interested_property_id") == context.get("current_property_id")
        or selected_property_id is not None
        or any(term in message_text.lower() for term in ("i like", "interested in this", "want this property", "இது பிடிக்கும்", "பிடிச்சிருக்கு"))
    )
    resolved_property_id = context.get("current_property_id")
    current_property = next((prop for prop in props if prop.id == resolved_property_id), None)
    if current_property is None and resolved_property_id and (property_interest or action_type == "site_visit"):
        current_property = (
            db.query(Property)
            .filter(Property.id == resolved_property_id, Property.is_active.is_(True))
            .first()
        )
    property_item = current_property if property_interest or action_type == "site_visit" else None
    if property_interest and resolved_property_id:
        context["interested_property_id"] = resolved_property_id
    if action_type == "site_visit":
        context["site_visit_intent"] = True
    if action_type == "agent":
        context["handoff_requested"] = True
    context["requirements_json"] = json.dumps(updated_reqs, ensure_ascii=False)
    context["preferred_language"] = updated_reqs.get("language", "en")
    conv.context_json = json.dumps(context, ensure_ascii=False)
    conv.updated_at = datetime.utcnow()

    assistant_msg = Message(
        conversation_id=conv_id,
        role="assistant",
        content=reply,
        extracted_requirements=json.dumps(updated_reqs, ensure_ascii=False),
    )
    db.add(assistant_msg)

    requirements_for_conversation = (
        db.query(CustomerRequirement)
        .filter(CustomerRequirement.conversation_id == conv_id)
        .all()
    )
    if len(requirements_for_conversation) > 1:
        raise HTTPException(status_code=409, detail="This conversation has conflicting requirement records")
    requirement = requirements_for_conversation[0] if requirements_for_conversation else None
    if requirement is not None and requirement.user_id != current_user.id:
        raise HTTPException(status_code=409, detail="The existing requirement ownership for this conversation cannot be verified")
    if requirement is None:
        requirement = CustomerRequirement(conversation_id=conv_id, user_id=current_user.id)
        db.add(requirement)
    requirement.user_id = current_user.id
    requirement.conversation_id = conv_id
    requirement.intent = updated_reqs.get("intent")
    requirement.buy_or_rent = updated_reqs.get("buy_or_rent")
    requirement.purpose = updated_reqs.get("purpose")
    requirement.location = updated_reqs.get("location")
    requirement.bedrooms = updated_reqs.get("bedrooms")
    requirement.bathrooms = updated_reqs.get("bathrooms")
    requirement.property_type = updated_reqs.get("property_type")
    requirement.furnished = updated_reqs.get("furnished")
    requirement.budget = updated_reqs.get("budget_target", updated_reqs.get("budget"))
    requirement.currency = "AED"
    requirement.timeline = updated_reqs.get("timeline")
    requirement.raw_json = json.dumps(updated_reqs, ensure_ascii=False)

    lead = _upsert_conversation_lead(db, conv_id, updated_reqs, action_type, current_user, property_item)
    if action_type == "agent" and lead:
        _upsert_handoff(db, conv_id, updated_reqs, lead, current_user, property_item)


@router.post("/chat", response_model=AIChatResponse)
def ai_chat(
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    if body.stream:
        return ai_chat_stream(body=body, current_user=current_user)

    conv_id = body.conversation_id or f"conv_{uuid.uuid4().hex}"
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if conv is not None and conv.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="This conversation belongs to another customer")
    configuration_error = provider_configuration_error()
    if configuration_error:
        raise HTTPException(
            status_code=503,
            detail=configuration_error,
        )
    if conv is None:
        conv = Conversation(id=conv_id, user_id=current_user.id, context_json="{}")
        db.add(conv)
        db.flush()

    try:
        context = json.loads(conv.context_json or "{}")
    except json.JSONDecodeError:
        logger.warning("Invalid saved context for conversation %s; starting with empty context", conv_id)
        context = {}
    try:
        requirements = json.loads(context.get("requirements_json", "{}"))
    except (TypeError, json.JSONDecodeError):
        requirements = {}
    if not requirements and body.requirements:
        requirements = dict(body.requirements)

    if body.selected_property_id is not None:
        selected = db.query(Property).filter(
            Property.id == body.selected_property_id,
            Property.is_active.is_(True),
        ).first()
        if selected is None:
            raise HTTPException(status_code=404, detail="Selected property not found")
        context["current_property_id"] = selected.id
        context["interested_property_id"] = selected.id
        context["current_property_selected"] = True

    user_msg = Message(conversation_id=conv_id, role="user", content=body.message)
    db.add(user_msg)
    db.flush()
    previous_messages = (
        db.query(Message)
        .filter(Message.conversation_id == conv_id, Message.id != user_msg.id)
        .order_by(Message.id.desc())
        .limit(10)
        .all()
    )
    history: List[Dict[str, str]] = [
        {"role": entry.role, "content": entry.content} for entry in reversed(previous_messages)
    ]

    try:
        reply, props, updated_reqs, action_type = process_ai_conversation(
            db=db,
            message=body.message,
            history=history,
            current_requirements=requirements,
            context=context,
        )
    except HTTPException:
        db.rollback()
        raise

    _save_conversation_turn(
        db=db,
        conv_id=conv_id,
        conv=conv,
        current_user=current_user,
        reply=reply,
        props=props,
        updated_reqs=updated_reqs,
        action_type=action_type,
        context=context,
        selected_property_id=body.selected_property_id,
        message_text=body.message,
    )

    audio_base64 = None
    audio_error = None
    if body.synthesize_audio:
        audio_base64, audio_error = _create_speech(reply, updated_reqs.get("language", "en"))

    db.commit()
    return AIChatResponse(
        response=reply,
        conversation_id=conv_id,
        properties=[to_response_dto(prop, updated_reqs) for prop in props],
        extracted_requirements=updated_reqs,
        action_type="handoff" if action_type == "agent" else action_type,
        audio_base64=audio_base64,
        language=updated_reqs.get("language", "en"),
        audio_error=audio_error,
    )


@router.post("/chat/stream")
def ai_chat_stream(
    body: AIChatRequest,
    current_user: User = Depends(require_auth),
):
    conv_id = body.conversation_id or f"conv_{uuid.uuid4().hex}"
    configuration_error = provider_configuration_error()
    if configuration_error:
        raise HTTPException(
            status_code=503,
            detail=configuration_error,
        )

    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if conv is not None and conv.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="This conversation belongs to another customer")
        if conv is None:
            conv = Conversation(id=conv_id, user_id=current_user.id, context_json="{}")
            db.add(conv)
            db.flush()

        try:
            context = json.loads(conv.context_json or "{}")
        except json.JSONDecodeError:
            context = {}
        try:
            requirements = json.loads(context.get("requirements_json", "{}"))
        except (TypeError, json.JSONDecodeError):
            requirements = {}
        if not requirements and body.requirements:
            requirements = dict(body.requirements)

        if body.selected_property_id is not None:
            selected = db.query(Property).filter(
                Property.id == body.selected_property_id,
                Property.is_active.is_(True),
            ).first()
            if selected is None:
                raise HTTPException(status_code=404, detail="Selected property not found")
            context["current_property_id"] = selected.id
            context["interested_property_id"] = selected.id
            context["current_property_selected"] = True

        user_msg = Message(conversation_id=conv_id, role="user", content=body.message)
        db.add(user_msg)
        db.flush()
        previous_messages = (
            db.query(Message)
            .filter(Message.conversation_id == conv_id, Message.id != user_msg.id)
            .order_by(Message.id.desc())
            .limit(10)
            .all()
        )
        history: List[Dict[str, str]] = [
            {"role": entry.role, "content": entry.content} for entry in reversed(previous_messages)
        ]

        token_generator, props, updated_reqs, action_type = stream_ai_conversation(
            db=db,
            message=body.message,
            history=history,
            current_requirements=requirements,
            context=context,
        )
        db.commit()
    except Exception:
        db.rollback()
        db.close()
        raise
    finally:
        db.close()

    def event_stream():
        meta_data = {
            "conversation_id": conv_id,
            "properties": [to_response_dto(prop, updated_reqs).model_dump() for prop in props],
            "extracted_requirements": updated_reqs,
            "action_type": "handoff" if action_type == "agent" else action_type,
            "language": updated_reqs.get("language", "en"),
        }
        yield f"event: meta\ndata: {json.dumps(meta_data)}\n\n"

        tokens_accumulated = []
        try:
            for token in token_generator:
                if token:
                    tokens_accumulated.append(token)
                    yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
        except Exception as e:
            logger.error("Token streaming failed: %s", e)
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"
            return

        full_reply = "".join(tokens_accumulated).strip()

        db_persist = SessionLocal()
        audio_base64 = None
        audio_error = None
        try:
            conv_record = db_persist.query(Conversation).filter(Conversation.id == conv_id).first()
            if conv_record:
                _save_conversation_turn(
                    db=db_persist,
                    conv_id=conv_id,
                    conv=conv_record,
                    current_user=current_user,
                    reply=full_reply,
                    props=props,
                    updated_reqs=updated_reqs,
                    action_type=action_type,
                    context=context,
                    selected_property_id=body.selected_property_id,
                    message_text=body.message,
                )
                if body.synthesize_audio:
                    audio_base64, audio_error = _create_speech(full_reply, updated_reqs.get("language", "en"))
                db_persist.commit()
        except Exception as err:
            logger.error("Failed saving streamed conversation turn: %s", err)
            db_persist.rollback()
        finally:
            db_persist.close()

        done_data = {
            "conversation_id": conv_id,
            "response": full_reply,
            "properties": [to_response_dto(prop, updated_reqs).model_dump() for prop in props],
            "extracted_requirements": updated_reqs,
            "action_type": "handoff" if action_type == "agent" else action_type,
            "audio_base64": audio_base64,
            "language": updated_reqs.get("language", "en"),
            "audio_error": audio_error,
        }
        yield f"event: done\ndata: {json.dumps(done_data)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

