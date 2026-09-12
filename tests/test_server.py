#!/usr/bin/env python3
"""Server security tests. No dependencies.

Run:  python3 tests/test_server.py
"""

import importlib.util
import os
import shutil
import sys
import tempfile
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Point the server at a throwaway data dir before importing it — the module
# resolves DATA_DIR at import time and we must not touch a real one.
_TMP = tempfile.mkdtemp(prefix="fitcheck-test-")
os.environ["FITCHECK_DATA_DIR"] = _TMP

_spec = importlib.util.spec_from_file_location("fitcheck_server", os.path.join(BASE, "server.py"))
server = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(server)


def tearDownModule():
    shutil.rmtree(_TMP, ignore_errors=True)


class URLSafety(unittest.TestCase):
    """The size-chart reader fetches URLs a stranger chose. Everything here
    is a request we must refuse to make on their behalf."""

    def test_rejects_cloud_metadata(self):
        # The one that turns an SSRF into leaked cloud credentials.
        for url in ("http://169.254.169.254/latest/meta-data/",
                    "http://[fd00:ec2::254]/latest/meta-data/",
                    "http://metadata.google.internal/"):
            with self.assertRaises(server.UnsafeURLError, msg=url):
                server.assert_safe_url(url)

    def test_rejects_loopback_and_private_ranges(self):
        for url in ("http://127.0.0.1:8080/", "http://localhost:8080/admin",
                    "http://10.0.0.5:8080/", "http://192.168.1.1:8080/",
                    "http://172.16.0.1:8080/", "http://[::1]:8080/",
                    "http://0.0.0.0:8080/"):
            with self.assertRaises(server.UnsafeURLError, msg=url):
                server.assert_safe_url(url)

    def test_rejects_non_http_schemes(self):
        for url in ("file:///etc/passwd", "gopher://x/", "ftp://x/",
                    "data:text/html,hi", "jar:http://x!/"):
            with self.assertRaises(server.UnsafeURLError, msg=url):
                server.assert_safe_url(url)

    def test_rejects_odd_ports(self):
        # Probing internal services that happen to answer HTTP.
        for url in ("https://example.com:22/", "https://example.com:6379/",
                    "https://example.com:5432/"):
            with self.assertRaises(server.UnsafeURLError, msg=url):
                server.assert_safe_url(url)

    def test_rejects_missing_host(self):
        with self.assertRaises(server.UnsafeURLError):
            server.assert_safe_url("http:///nohost")

    def test_ip_classification(self):
        self.assertTrue(server._ip_is_public("93.184.216.34"))
        self.assertTrue(server._ip_is_public("2606:2800:220:1:248:1893:25c8:1946"))
        for ip in ("127.0.0.1", "10.1.2.3", "192.168.0.1", "169.254.169.254",
                   "::1", "fe80::1", "0.0.0.0", "224.0.0.1", "not-an-ip"):
            self.assertFalse(server._ip_is_public(ip), ip)

    def test_ipv4_mapped_ipv6_is_not_a_bypass(self):
        # ::ffff:127.0.0.1 is loopback wearing a v6 hat.
        self.assertFalse(server._ip_is_public("::ffff:127.0.0.1"))
        self.assertFalse(server._ip_is_public("::ffff:169.254.169.254"))

    def test_allows_ordinary_public_pages(self):
        try:
            server.assert_safe_url("https://example.com/size-guide")
        except server.UnsafeURLError as e:
            self.fail("blocked a legitimate page: %s" % e)
        except Exception:
            self.skipTest("no DNS in this environment")


class PasswordHashing(unittest.TestCase):
    def test_round_trip(self):
        h = server._hash_pw("hunter2-and-then-some")
        self.assertTrue(h.startswith("scrypt$"))
        matches, rehash = server._verify_pw({"passHash": h}, "hunter2-and-then-some")
        self.assertTrue(matches)
        self.assertFalse(rehash)

    def test_wrong_password_fails(self):
        h = server._hash_pw("correct")
        matches, _ = server._verify_pw({"passHash": h}, "incorrect")
        self.assertFalse(matches)

    def test_salt_is_unique_per_hash(self):
        a = server._hash_pw("same password")
        b = server._hash_pw("same password")
        self.assertNotEqual(a, b, "two hashes of one password must differ")

    def test_legacy_sha256_still_verifies_and_asks_for_upgrade(self):
        # Accounts created before scrypt must keep working, and must be
        # flagged so login rewrites them.
        salt = "0011223344556677"
        acct = {"salt": salt, "passHash": server._hash_pw_legacy(salt, "oldpass")}
        matches, rehash = server._verify_pw(acct, "oldpass")
        self.assertTrue(matches)
        self.assertTrue(rehash)

    def test_malformed_stored_hash_is_a_clean_failure(self):
        for bad in ("scrypt$oops", "scrypt$a$b$c$d$e", "", None):
            matches, _ = server._verify_pw({"passHash": bad}, "anything")
            self.assertFalse(matches, repr(bad))


class Accounts(unittest.TestCase):
    def setUp(self):
        # Each test starts from an empty account store.
        server._save_accounts({})
        server._TOKEN_INDEX.clear()
        server._TOKEN_INDEX_READY = False

    def test_register_login_and_resolve(self):
        reg = server.account_register({"email": "A@Example.com ", "password": "s3cret!", "name": "Ada"})
        self.assertTrue(reg["ok"], reg)
        self.assertEqual(reg["email"], "a@example.com")
        self.assertEqual(server._resolve_token(reg["token"]), "a@example.com")

        log = server.account_login({"email": "a@example.com", "password": "s3cret!"})
        self.assertTrue(log["ok"], log)
        self.assertEqual(server._resolve_token(log["token"]), "a@example.com")

    def test_stored_record_holds_no_plaintext(self):
        server.account_register({"email": "b@example.com", "password": "plaintext-canary", "name": "B"})
        with open(server.ACCOUNTS_FILE, encoding="utf-8") as f:
            blob = f.read()
        self.assertNotIn("plaintext-canary", blob)

    def test_wrong_password_is_refused(self):
        server.account_register({"email": "c@example.com", "password": "right-one", "name": "C"})
        self.assertFalse(server.account_login({"email": "c@example.com", "password": "wrong"})["ok"])

    def test_unknown_account_and_wrong_password_are_indistinguishable(self):
        server.account_register({"email": "d@example.com", "password": "right-one", "name": "D"})
        missing = server.account_login({"email": "nobody@example.com", "password": "x"})
        wrong = server.account_login({"email": "d@example.com", "password": "x"})
        self.assertEqual(missing["error"], wrong["error"])

    def test_duplicate_registration_is_refused(self):
        server.account_register({"email": "e@example.com", "password": "abcdef", "name": "E"})
        self.assertFalse(server.account_register({"email": "e@example.com", "password": "abcdef", "name": "E"})["ok"])

    def test_short_password_and_bad_email_are_refused(self):
        self.assertFalse(server.account_register({"email": "f@example.com", "password": "12345", "name": "F"})["ok"])
        self.assertFalse(server.account_register({"email": "not-an-email", "password": "123456", "name": "F"})["ok"])

    def test_logout_kills_the_token(self):
        reg = server.account_register({"email": "g@example.com", "password": "abcdef", "name": "G"})
        server.account_logout({"token": reg["token"]})
        self.assertIsNone(server._resolve_token(reg["token"]))

    def test_delete_removes_account_and_every_token(self):
        reg = server.account_register({"email": "h@example.com", "password": "abcdef", "name": "H"})
        second = server.account_login({"email": "h@example.com", "password": "abcdef"})["token"]
        self.assertTrue(server.account_delete({"token": reg["token"]})["ok"])
        self.assertIsNone(server._resolve_token(reg["token"]))
        self.assertIsNone(server._resolve_token(second))
        self.assertNotIn("h@example.com", server._load_accounts())

    def test_legacy_account_is_upgraded_on_login(self):
        salt = "aabbccdd"
        server._save_accounts({"i@example.com": {
            "salt": salt, "passHash": server._hash_pw_legacy(salt, "legacypw"),
            "name": "I", "createdAt": 0, "tokens": {},
        }})
        self.assertTrue(server.account_login({"email": "i@example.com", "password": "legacypw"})["ok"])
        stored = server._load_accounts()["i@example.com"]["passHash"]
        self.assertTrue(stored.startswith("scrypt$"), "login did not upgrade the hash")
        # And still works afterwards.
        self.assertTrue(server.account_login({"email": "i@example.com", "password": "legacypw"})["ok"])

    def test_garbage_tokens_resolve_to_nobody(self):
        for tok in ("", None, "nope", "0" * 64):
            self.assertIsNone(server._resolve_token(tok))


class AdminKey(unittest.TestCase):
    def test_correct_key_accepted_and_others_refused(self):
        self.assertTrue(server.admin_key_ok(server.admin_key()))
        for bad in ("", None, "wrong", server.admin_key() + "x", server.admin_key()[:-1]):
            self.assertFalse(server.admin_key_ok(bad), repr(bad))


class RateLimiting(unittest.TestCase):
    def setUp(self):
        server._RATE_HITS.clear()

    def test_login_budget_runs_out(self):
        limit = server.RATE_LIMITS["/api/account/login"][0]
        for _ in range(limit):
            server.rate_check("9.9.9.9", "/api/account/login")
        with self.assertRaises(server.RateLimited):
            server.rate_check("9.9.9.9", "/api/account/login")

    def test_clients_have_separate_budgets(self):
        limit = server.RATE_LIMITS["/api/account/login"][0]
        for _ in range(limit):
            server.rate_check("1.1.1.1", "/api/account/login")
        server.rate_check("2.2.2.2", "/api/account/login")  # must not raise

    def test_routes_have_separate_budgets(self):
        limit = server.RATE_LIMITS["/api/account/login"][0]
        for _ in range(limit):
            server.rate_check("3.3.3.3", "/api/account/login")
        server.rate_check("3.3.3.3", "/api/size-chart")  # must not raise

    def test_retry_after_is_useful(self):
        limit = server.RATE_LIMITS["/api/account/register"][0]
        for _ in range(limit):
            server.rate_check("4.4.4.4", "/api/account/register")
        with self.assertRaises(server.RateLimited) as cm:
            server.rate_check("4.4.4.4", "/api/account/register")
        self.assertGreater(cm.exception.retry_after, 0)

    def test_unlisted_api_route_gets_the_default(self):
        self.assertEqual(server._rate_rule("/api/something-new"), server.RATE_DEFAULT)


class FitFeedback(unittest.TestCase):
    def setUp(self):
        server._save_feedback({})

    def test_submit_and_aggregate(self):
        for _ in range(7):
            server.fit_feedback_submit({"brand": "Acme", "garmentType": "tshirt",
                                        "size": "M", "outcome": "too-tight"})
        for _ in range(3):
            server.fit_feedback_submit({"brand": "Acme", "garmentType": "tshirt",
                                        "size": "M", "outcome": "good"})
        out = server.fit_feedback_query("Acme", "tshirt")
        self.assertEqual(out["total"], 10)
        self.assertEqual(out["tooTightPct"], 70)
        self.assertIn("Runs small", out["verdict"])

    def test_brand_match_is_case_insensitive(self):
        server.fit_feedback_submit({"brand": "Acme", "garmentType": "shirt",
                                    "size": "L", "outcome": "good"})
        self.assertEqual(server.fit_feedback_query("ACME", "")["total"], 1)

    def test_unknown_brand_reports_nothing_rather_than_guessing(self):
        self.assertEqual(server.fit_feedback_query("Nobody", "")["total"], 0)

    def test_bad_submissions_are_refused(self):
        self.assertFalse(server.fit_feedback_submit({"brand": "", "outcome": "good"})["ok"])
        self.assertFalse(server.fit_feedback_submit({"brand": "X", "outcome": "banana"})["ok"])
        self.assertFalse(server.fit_feedback_submit({"brand": "X"})["ok"])

    def test_stores_nothing_that_identifies_a_person(self):
        server.fit_feedback_submit({
            "brand": "Acme", "garmentType": "tshirt", "size": "M", "outcome": "good",
            # A malicious or buggy client throwing extra fields at us.
            "email": "someone@example.com", "token": "secret", "chest": 96,
        })
        with open(server.FEEDBACK_FILE, encoding="utf-8") as f:
            blob = f.read()
        for leak in ("someone@example.com", "secret", "96"):
            self.assertNotIn(leak, blob, "aggregate store leaked %r" % leak)


if __name__ == "__main__":
    unittest.main(verbosity=2)
