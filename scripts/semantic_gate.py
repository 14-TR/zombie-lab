"""ZL020 deterministic constraint, NOT repaired model predictions or safety proof."""
from copy import deepcopy
from semantics_core import FACTS, OPTIONS, valid, controller, simulate as historical_simulate


def simulate(decision, world, authorized_goal):
    """Unchanged physics, stricter SECONDARY completion; historical code untouched."""
    trace = historical_simulate(decision, world, authorized_goal)
    companion = trace['frames'][-1]['companion']
    trace['goal_completed'] = ((authorized_goal == 'hold' and decision['action'] == 'wait') or
        (trace['outcome'] == 'shelter' and ((authorized_goal == 'solo' and not companion) or
        (authorized_goal == 'together' and companion))))
    return trace

UNCERTAIN = frozenset(('suspected_positive', 'suspected_negative', 'conflicting'))


def required_clarification(state):
    if not valid(state):
        raise ValueError('invalid closed interpretation')
    evidence = any(state[k] in UNCERTAIN for k in FACTS)
    goal = state['policy'] == 'unclear'
    return 'both' if goal and evidence else 'goal' if goal else 'evidence' if evidence else 'none'


def adapt(raw):
    """Only add abstention; never erase a raw request for clarification."""
    good = valid(raw)
    required = required_clarification(raw) if good else 'invalid'
    original = controller(raw)
    reasons = []
    if required != 'none': reasons.append('interpreted_' + required)
    if good and raw['clarification'] != 'none': reasons.append('raw_' + raw['clarification'])
    gated = dict(action='ask', route=['Yard'], collect=False) if reasons else deepcopy(original)
    return dict(raw_interpretation=deepcopy(raw), raw_clarification=raw.get('clarification') if isinstance(raw, dict) else None,
                required_clarification=required, raw_decision=original, gated_decision=gated,
                gate_reasons=reasons, gate_changed=gated != original,
                authority='code-enforced abstention over interpreted labels; extraction errors can bypass gate')
