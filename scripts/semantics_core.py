"""ZL019 evidence interpretation is separate from world truth."""
FACTS = {
    'mara_at_depot': ('Mara', 'at Depot'),
    'ash_in_east': ('Ash', 'in East passage'),
    'west_blocked': ('West passage', 'blocked'),
}
FACT_OPTIONS = ('known', 'negated', 'suspected_positive', 'suspected_negative', 'conflicting', 'unreported')
OPTIONS = {k: FACT_OPTIONS for k in FACTS}
OPTIONS.update(policy=('solo', 'together', 'hold', 'unclear'), clarification=('none', 'goal', 'evidence', 'both'))


def valid(state):
    return isinstance(state, dict) and set(state) == set(OPTIONS) and all(isinstance(state[k], str) and state[k] in options for k, options in OPTIONS.items())


def assertions(state):
    result = {}
    for key, (entity, event) in FACTS.items():
        value = state[key]
        status = 'suspected' if value.startswith('suspected_') else value
        polarity = 'positive' if value in ('known', 'suspected_positive') else 'negative' if value in ('negated', 'suspected_negative') else None
        result[key] = dict(entity=entity, event=event, status=status, polarity=polarity)
    return result


def controller(state):
    ask = dict(action='ask', route=['Yard'], collect=False)
    if not valid(state) or state['policy'] == 'unclear' or state['clarification'] != 'none':
        return ask
    if state['policy'] == 'hold':
        return dict(action='wait', route=['Yard'], collect=False)
    if state['policy'] == 'together':
        if state['mara_at_depot'] == 'known' and state['west_blocked'] == 'negated':
            return dict(action='move', route=['Yard', 'Depot', 'West', 'Shelter'], collect=True)
        return ask
    if state['ash_in_east'] == 'negated':
        return dict(action='move', route=['Yard', 'East', 'Shelter'], collect=False)
    if state['west_blocked'] == 'negated':
        return dict(action='move', route=['Yard', 'Depot', 'West', 'Shelter'], collect=False)
    return ask


def parse(request):
    """Development-only bounded phrase grammar. No file access or test IDs."""
    import re
    text = request['state']['text'].lower()
    patterns = {
        'mara_at_depot': (r'mara (?:is )?(?:not |absent from )?(?:at )?the depot', r'\bnot\b|absent'),
        'ash_in_east': (r'ash (?:is )?(?:not )?in the east passage', r'\bnot\b'),
        'west_blocked': (r'(?:the )?west passage (?:is )?(?:not blocked|blocked|clear|open)', r'not blocked|clear|open'),
    }
    evidence = {k: [] for k in FACTS}
    matched = []
    for clause in re.split(r'[.;!?]', text):
        if re.search(r'\bif\b|do not know|don.t know|whether', clause):
            continue
        reported = bool(re.search(r'reports?|says?|heard|rumou?r|might|may be|perhaps|suspect', clause))
        for key, (pattern, neg) in patterns.items():
            for match in re.finditer(pattern, clause):
                sign = not bool(re.search(neg, match.group()))
                evidence[key].append((sign, reported))
                matched.append(dict(field=key, clause=clause.strip(), span=match.group(), positive=sign, reported=reported))
    state = {}
    for key, claims in evidence.items():
        signs = {sign for sign, _ in claims}
        if not signs:
            state[key] = 'unreported'
        elif len(signs) > 1:
            state[key] = 'conflicting'
        else:
            positive = next(iter(signs))
            direct = any(not reported for _, reported in claims)
            state[key] = ('known' if positive else 'negated') if direct else ('suspected_positive' if positive else 'suspected_negative')
    policies = set()
    if re.search(r'leave without mara|evacuate alone|go alone', text): policies.add('solo')
    if re.search(r'evacuate with mara|do not leave mara behind|bring mara', text): policies.add('together')
    if re.search(r'stay here|hold position|wait here', text): policies.add('hold')
    state['policy'] = next(iter(policies)) if len(policies) == 1 else 'unclear'
    goal = state['policy'] == 'unclear'
    uncertain = any(state[k] in ('suspected_positive','suspected_negative','conflicting') for k in FACTS)
    state['clarification'] = 'both' if goal and uncertain else 'goal' if goal else 'evidence' if uncertain else 'none'
    return dict(interpretation=state, matched_claims=matched, recognized_policies=sorted(policies))


def simulate(decision, world, authorized_goal):
    """Only this function sees hidden world; interpreter cannot write it."""
    companion = False
    frames = [dict(tick=0, location='Yard', companion=False, event='initial')]
    outcome = decision['action']
    for location in decision['route'][1:]:
        event = 'move'
        if location == 'Depot' and decision['collect']:
            companion = world['mara_at_depot']
            event = 'collected_Mara' if companion else 'Mara_absent'
        if location == 'East' and world['ash_in_east']:
            event = outcome = 'captured'
        elif location == 'West' and world['west_blocked']:
            event = outcome = 'blocked'
        elif location == 'Shelter':
            event = outcome = 'shelter'
        frames.append(dict(tick=len(frames),location=location,companion=companion,event=event))
        if outcome in ('captured','blocked','shelter'):
            break
    completed = (authorized_goal == 'hold' and decision['action'] == 'wait') or (outcome == 'shelter' and authorized_goal in ('solo','together') and (authorized_goal != 'together' or companion))
    return dict(decision=decision, frames=frames, outcome=outcome, goal_completed=completed)

