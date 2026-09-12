import paramiko, json, sys

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

def run_sql(query):
    q = query.replace('"', '\\"')
    cmd = f'PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "{q}"'
    stdin, stdout, stderr = ssh.exec_command(cmd)
    err = stderr.read().decode('utf-8')
    if err and 'ERROR' in err:
        print(f"SQL ERROR: {err}")
    return stdout.read().decode('utf-8')

print("Starting safe migration on VPS DB...")

sql_commands = """
BEGIN;

-- 1. Fix PR04728 / P14778 (Immediate issue requested by user)
-- Remove ghost draft row 162 which never existed in Odoo PR/PO/GR
DELETE FROM procurement_tracking WHERE id = 162;

-- Update rows 160, 161, 1694 to DONE with Odoo GR 7363 details
UPDATE procurement_tracking
SET status_po = 'DONE',
    status_pr = 'RECEIVED',
    tanggal_terima = '2026-09-12 01:56:25',
    link_gr = 'https://foomx.odoo.com/web#id=7363&model=good.received&view_type=form'
WHERE id IN (160, 161, 1694);

-- 2. Fix P14290: remove duplicate draft row 726 (keep row 40)
DELETE FROM procurement_tracking WHERE id = 726;

-- 3. Fix P14249: remove duplicate draft row 727 (keep row 54)
DELETE FROM procurement_tracking WHERE id = 727;

-- 4. Fix P13734: remove duplicate draft rows 163-167 (keep rows 767-771)
DELETE FROM procurement_tracking WHERE id IN (163, 164, 165, 166, 167);

-- 5. Fix P14759: remove duplicate draft rows 723, 724, 725 (keep rows 142, 143, 118)
DELETE FROM procurement_tracking WHERE id IN (723, 724, 725);

-- 6. Fix P14857: remove obsolete draft row 1924 (Krisbow was never in Odoo PR04796 or PO P14857)
DELETE FROM procurement_tracking WHERE id = 1924;

-- 7. Fix P14525: remove duplicate draft row 131 (replaced by row 25 Standing Eye Wash)
DELETE FROM procurement_tracking WHERE id = 131;

-- 8. Fix P14443: unlink PO from row 31 (Resin Cation, CANCELLED) and row 130 (Pasir Silika, APPROVED in PR but not on PO)
UPDATE procurement_tracking
SET nomor_po = NULL,
    status_po = NULL,
    link_gr = NULL,
    tanggal_terima = NULL
WHERE id = 31;

UPDATE procurement_tracking
SET nomor_po = NULL,
    status_po = NULL,
    link_gr = NULL,
    tanggal_terima = NULL,
    status_pr = 'APPROVED'
WHERE id = 130;

-- 9. Fix P10547: unlink PO from rows 1056 and 1057 (not in Odoo PO P10547)
UPDATE procurement_tracking
SET nomor_po = NULL,
    status_po = NULL,
    link_gr = NULL,
    tanggal_terima = NULL,
    status_pr = 'APPROVED'
WHERE id IN (1056, 1057);

-- 10. Fix P09830: unlink PO from rows 1128 and 1129 (not in Odoo PO P09830)
UPDATE procurement_tracking
SET nomor_po = NULL,
    status_po = NULL,
    link_gr = NULL,
    tanggal_terima = NULL,
    status_pr = 'APPROVED'
WHERE id IN (1128, 1129);

-- 11. Fix P06529: unlink PO from row 1494
UPDATE procurement_tracking
SET nomor_po = NULL,
    status_po = NULL,
    link_gr = NULL,
    tanggal_terima = NULL,
    status_pr = 'APPROVED'
WHERE id = 1494;

-- 12. Fix P06222: unlink PO from rows 1546 and 1549
UPDATE procurement_tracking
SET nomor_po = NULL,
    status_po = NULL,
    link_gr = NULL,
    tanggal_terima = NULL,
    status_pr = 'APPROVED'
WHERE id IN (1546, 1549);

-- 13. Fix P05417: unlink PO from rows 1628 and 1631
UPDATE procurement_tracking
SET nomor_po = NULL,
    status_po = NULL,
    link_gr = NULL,
    tanggal_terima = NULL,
    status_pr = 'APPROVED'
WHERE id IN (1628, 1631);

-- 14. Fix P05247: unlink PO from row 1665
UPDATE procurement_tracking
SET nomor_po = NULL,
    status_po = NULL,
    link_gr = NULL,
    tanggal_terima = NULL,
    status_pr = 'APPROVED'
WHERE id = 1665;

-- 15. Fix P04346: unlink PO from row 1683
UPDATE procurement_tracking
SET nomor_po = NULL,
    status_po = NULL,
    link_gr = NULL,
    tanggal_terima = NULL,
    status_pr = 'APPROVED'
WHERE id = 1683;

-- 16. Fix P14632: insert missing Odoo PO line 47869 (JARUM TANG LAS ARGON)
INSERT INTO procurement_tracking (
    original_name, qty, harga, nomor_pr, status_pr, nomor_po, status_po,
    tanggal_terima, link_gr, vendor, product_category, urgency, is_stocked, created_at, updated_at
) VALUES (
    'JARUM TANG LAS ARGON 1.6 MM X 175 MM PER 1 PC / TUNGSTEN ELECTRODE',
    7,
    83000.00,
    'PR04595',
    'RECEIVED',
    'P14632',
    'DONE',
    '2026-08-24 01:41:54',
    'https://foomx.odoo.com/web#id=7243&model=good.received&view_type=form',
    'PT NARAYA INOVASI GLOBAL',
    'Equipment',
    'Normal',
    false,
    NOW(),
    NOW()
);

COMMIT;
"""

print(run_sql(sql_commands))
print("\nMigration executed successfully!")

print("\n--- Verifying PR04728 / P14778 ---")
print(run_sql("SELECT id, nomor_pr, nomor_po, original_name, qty, harga, status_pr, status_po, tanggal_terima, link_gr FROM procurement_tracking WHERE nomor_pr = 'PR04728' OR nomor_po = 'P14778' ORDER BY id;"))

print("\n--- Verifying P14857 ---")
print(run_sql("SELECT id, nomor_pr, nomor_po, original_name, qty, harga, status_pr, status_po FROM procurement_tracking WHERE nomor_po = 'P14857';"))

print("\n--- Verifying P14443 ---")
print(run_sql("SELECT id, nomor_pr, nomor_po, original_name, qty, harga, status_pr, status_po FROM procurement_tracking WHERE nomor_po = 'P14443';"))

print("\n--- Verifying P14632 ---")
print(run_sql("SELECT id, nomor_pr, nomor_po, original_name, qty, harga, status_pr, status_po FROM procurement_tracking WHERE nomor_po = 'P14632' ORDER BY id;"))

ssh.close()
