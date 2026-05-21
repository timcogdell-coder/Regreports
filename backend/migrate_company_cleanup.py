from app import create_app
from models import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    with db.engine.begin() as conn:
        # Fix stale FK references on tbl_company that still point at dropped 'users' table
        conn.execute(text("""
            ALTER TABLE tbl_company
            DROP CONSTRAINT IF EXISTS tbl_company_permit_coordinator_id_fkey,
            DROP CONSTRAINT IF EXISTS tbl_company_signature_authority_id_fkey
        """))
        conn.execute(text("""
            ALTER TABLE tbl_company
            ADD CONSTRAINT tbl_company_permit_coordinator_id_fkey
                FOREIGN KEY (permit_coordinator_id) REFERENCES tbl_users(id),
            ADD CONSTRAINT tbl_company_signature_authority_id_fkey
                FOREIGN KEY (signature_authority_id) REFERENCES tbl_users(id)
        """))

        # Add is_active column for soft delete
        conn.execute(text("""
            ALTER TABLE tbl_company
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
        """))

        # Soft delete Regreports (id=1 — test/dummy account)
        conn.execute(text("UPDATE tbl_company SET is_active = FALSE WHERE id = 1"))

        # Hard delete Bush River WWTP (id=2) — no real data, safe to remove
        # Delete in FK order
        from sqlalchemy import text as t

        # Get sample ids for company 2
        sample_ids = [r[0] for r in conn.execute(text(
            "SELECT id FROM tbl_sample WHERE company_id = 2"
        )).fetchall()]

        permit_ids = [r[0] for r in conn.execute(text(
            "SELECT id FROM tbl_permits WHERE company_id = 2"
        )).fetchall()]

        limit_ids = []
        for pid in permit_ids:
            rows = conn.execute(text(
                f"SELECT id FROM tbl_permit_limits WHERE permit_id = {pid}"
            )).fetchall()
            limit_ids.extend([r[0] for r in rows])

        # violation ids
        violation_ids = [r[0] for r in conn.execute(text(
            "SELECT id FROM tbl_violations WHERE company_id = 2"
        )).fetchall()]

        if violation_ids:
            conn.execute(text(f"DELETE FROM tbl_enforcement_history WHERE violation_id = ANY(ARRAY{violation_ids}::int[])"))
        conn.execute(text("DELETE FROM tbl_violations WHERE company_id = 2"))

        if limit_ids:
            conn.execute(text(f"DELETE FROM tbl_sample_results WHERE permit_limit_id = ANY(ARRAY{limit_ids}::int[])"))

        if sample_ids:
            conn.execute(text(f"DELETE FROM tbl_sample_results WHERE sample_id = ANY(ARRAY{sample_ids}::int[])"))

        conn.execute(text("DELETE FROM tbl_sample WHERE company_id = 2"))

        if limit_ids:
            conn.execute(text(f"DELETE FROM tbl_permit_limits WHERE id = ANY(ARRAY{limit_ids}::int[])"))

        conn.execute(text("DELETE FROM tbl_permits WHERE company_id = 2"))
        conn.execute(text("DELETE FROM tbl_flow_meters WHERE company_id = 2"))
        conn.execute(text("DELETE FROM tbl_surcharge_calculations WHERE company_id = 2"))
        conn.execute(text("UPDATE tbl_audit_log SET user_id = NULL WHERE user_id IN (SELECT id FROM tbl_users WHERE company_id = 2)"))
        conn.execute(text("DELETE FROM tbl_users WHERE company_id = 2"))
        conn.execute(text("DELETE FROM tbl_company WHERE id = 2"))

    print("Done:")
    print("  - Fixed tbl_company FK references to tbl_users")
    print("  - Added is_active column to tbl_company")
    print("  - Regreports (id=1) soft-deleted (is_active=FALSE)")
    print("  - Bush River WWTP (id=2) hard-deleted with all dependents")
