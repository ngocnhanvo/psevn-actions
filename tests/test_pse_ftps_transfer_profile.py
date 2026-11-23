#!/usr/bin/env python3
"""Offline socket-hint contract for the bounded temporary PSE FTPS probe."""
from __future__ import annotations

import ftplib
import importlib.util
from pathlib import Path
import socket
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "pse-ftps-transfer-profile.py"
spec = importlib.util.spec_from_file_location("pse_ftps_transfer_profile", MODULE)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class FakeTLSDataSocket:
    def __init__(self, fail=False):
        self.operations = []
        self.fail = fail
        self.closed = False
    def setsockopt(self, level, flag, value):
        self.operations.append((level, flag, value))
        if self.fail:
            raise OSError("Fake tuning not supported")
    def getsockopt(self, level, flag):
        self.operations.append(("get", level, flag))
        return 262144
    def close(self):
        self.closed = True


class ProbeSocketHintTest(unittest.TestCase):
    def test_default_client_retains_unmodified_encrypted_data_socket(self):
        conn = FakeTLSDataSocket()
        ftp = probe.TunableTLS()
        with patch.object(ftplib.FTP_TLS, "ntransfercmd", return_value=(conn, None)):
            sock, length = ftp.ntransfercmd("STOR temp-file")
        self.assertIs(sock, conn)
        self.assertIsNone(length)
        self.assertFalse(any(isinstance(event[0], int) for event in conn.operations))
        self.assertEqual(ftp.negotiated_send_buffer, 262144)
        self.assertFalse(conn.closed)

    def test_tuned_client_sets_only_data_send_buffer(self):
        conn = FakeTLSDataSocket()
        ftp = probe.TunableTLS()
        ftp.send_buffer_hint = 4 * 1024 * 1024
        with patch.object(ftplib.FTP_TLS, "ntransfercmd", return_value=(conn, None)):
            sock, _ = ftp.ntransfercmd("STOR temp-file")
        self.assertIs(sock, conn)
        self.assertIn((socket.SOL_SOCKET, socket.SO_SNDBUF, 4 * 1024 * 1024), conn.operations)
        self.assertEqual(ftp.negotiated_send_buffer, 262144)
        self.assertFalse(conn.closed)

    def test_failed_socket_hint_closes_temporary_data_connection(self):
        conn = FakeTLSDataSocket(fail=True)
        ftp = probe.TunableTLS()
        ftp.send_buffer_hint = 4 * 1024 * 1024
        with patch.object(ftplib.FTP_TLS, "ntransfercmd", return_value=(conn, None)):
            with self.assertRaises(OSError):
                ftp.ntransfercmd("STOR temp-file")
        self.assertTrue(conn.closed)


if __name__ == "__main__":
    unittest.main()
