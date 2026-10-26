import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.user import User
from activate_existing_admin import activate_existing_admin


class AdminRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.admin = User(
            email="admin@example.com",
            hashed_password="unchanged-hash",
            full_name="Existing Admin",
            role="admin",
            is_active=False,
        )
        self.session.add(self.admin)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_confirmation_activates_only_existing_admin_and_preserves_password_and_role(self):
        user_id = self.admin.id
        user = activate_existing_admin(
            self.session,
            " ADMIN@example.com ",
            "ACTIVATE admin@example.com",
        )

        self.assertEqual(user.id, user_id)
        self.assertTrue(user.is_active)
        self.assertEqual(user.role, "admin")
        self.assertEqual(user.hashed_password, "unchanged-hash")
        self.assertEqual(self.session.query(User).count(), 1)

    def test_missing_confirmation_changes_nothing(self):
        for confirmation in ("NO", "ACTIVATE", "ACTIVATE other@example.com"):
            with self.subTest(confirmation=confirmation):
                with self.assertRaisesRegex(ValueError, "not confirmed"):
                    activate_existing_admin(self.session, self.admin.email, confirmation)

        self.session.refresh(self.admin)
        self.assertFalse(self.admin.is_active)

    def test_existing_active_admin_blocks_recovery(self):
        active_admin = User(
            email="active@example.com",
            hashed_password="unchanged-hash",
            full_name="Active Admin",
            role="admin",
            is_active=True,
        )
        self.session.add(active_admin)
        self.session.commit()

        with self.assertRaisesRegex(ValueError, "active administrator exists"):
            activate_existing_admin(
                self.session,
                self.admin.email,
                "ACTIVATE admin@example.com",
            )

        self.session.refresh(self.admin)
        self.assertFalse(self.admin.is_active)


if __name__ == "__main__":
    unittest.main()
