"""Regole degli incidenti: test senza database."""

from datetime import UTC, datetime, timedelta

import pytest

from app.incidents import CheckState, decide

T0 = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)


def checks(*stati: bool) -> list[CheckState]:
    """Crea controlli dal più recente al più vecchio, uno all'ora."""
    return [CheckState(T0 - timedelta(hours=i), su, None if su else "timeout") for i, su in enumerate(stati)]


def test_nessun_controllo_nessuna_azione():
    assert decide([], has_open_incident=False).action == "none"


def test_un_solo_controllo_giu_non_apre():
    assert decide(checks(False, True), has_open_incident=False).action == "none"


def test_due_controlli_giu_aprono_dal_primo():
    d = decide(checks(False, False, True), has_open_incident=False)
    assert d.action == "open"
    assert d.at == T0 - timedelta(hours=1)  # inizia dal primo controllo giù
    assert d.cause == "timeout"


def test_pochi_controlli_non_aprono():
    assert decide(checks(False), has_open_incident=False).action == "none"


def test_incidente_aperto_resta_aperto_se_ancora_giu():
    assert decide(checks(False, False), has_open_incident=True).action == "none"


def test_incidente_si_chiude_quando_torna_su():
    d = decide(checks(True, False), has_open_incident=True)
    assert d.action == "close"
    assert d.at == T0


def test_soglia_personalizzata():
    assert decide(checks(False, False), has_open_incident=False, threshold=3).action == "none"
    assert decide(checks(False, False, False), has_open_incident=False, threshold=3).action == "open"
    assert decide(checks(False), has_open_incident=False, threshold=1).action == "open"


def test_soglia_non_valida():
    with pytest.raises(ValueError):
        decide(checks(False), has_open_incident=False, threshold=0)
