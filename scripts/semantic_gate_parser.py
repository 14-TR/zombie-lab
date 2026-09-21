"""Bounded, inspectable clause grammar. No IDs, gold lookup, file access or model.
Grammar misses and overgeneralizations remain errors; this is not a semantic oracle.
"""
import re
from semantics_core import FACTS
from semantic_gate import required_clarification

# Polarity belongs to the matched proposition, source strength to its clause.
ENTITY = {
 'mara_at_depot': (r'\bmara\b.{0,35}\bdepot\b|\bdepot\b.{0,30}\bmara\b', r'\bnot\b|\babsent\b|\bno mara\b'),
 'ash_in_east': (r'\bash\b.{0,40}\beast(?:ern)?\b|\beast(?:ern)?\b.{0,40}\bash\b', r'\bnot\b|\babsent\b|\bno ash\b|ash[- ]free'),
 'west_blocked': (r'\bwest(?:ern)?(?:[- ](?:passage|way|one))?\b.{0,40}\b(?:not blocked|blocked|clear|open|unobstructed|obstructed|sealed|free of obstructions|no obstruction)\b|\b(?:unobstructed|nothing obstructs)\b.{0,25}\bwest(?:ern)?\b', r'not blocked|clear|open|unobstructed|free of obstructions|no obstruction|nothing obstructs'),
}
SOURCE = r'\breports?\b|\bsays?\b|\bheard\b|\brumou?r\b|\bmight\b|\bmay\b|perhaps|suspect|\baccount\b|\bassures?\b|\binsists?\b|\bclaims?\b|\bpossibly\b'
NONASSERTION = r'\bif\b|\bunless\b|\bwhether\b|do not know|don.t know|unknown|not known|\bimagine\b'
COMMAND = r'^(?:please )?(?:go|leave|evacuate|bring|escort|collect|stay|wait|hold|do not|don.t|get|reach|take|head|make|ensure|paint|ignore|output|return|pretend)\b'
POLICY = {
 'solo': r'leave without mara|(?:evacuate|go) alone|(?:shelter|evacuate|go).{0,28}(?:on your own|by yourself|without mara)|do not collect mara|without picking mara up|take yourself to shelter,? not mara|leaving mara out of the plan',
 'together': r'evacuate with mara|do not leave mara behind|without leaving mara behind|bring mara|escort mara|ensure mara accompanies|not at the cost of abandoning (?:her|mara)',
 'hold': r'stay here|hold position|wait here|remain where you are',
}


def parse(request):
    text = request['state']['text'].lower().replace('\u2019', "'")
    claims = {k: [] for k in FACTS}; matched = []; skipped = []
    # Preserve question punctuation before classification. Conjunction splits
    # isolate explicitly new clauses, not every 'and' inside a quoted report.
    clauses = re.split(r'(?<=[.!?;])\s*|,?\s+but\s+|,?\s+while\s+', text)
    for clause in clauses:
        clause = clause.strip()
        if not clause: continue
        if '?' in clause or re.search(NONASSERTION, clause) or re.search(COMMAND, clause):
            skipped.append(dict(clause=clause, reason='nonassertion_or_command'))
            continue
        reported = bool(re.search(SOURCE, clause))
        for field, (pattern, negative) in ENTITY.items():
            for match in re.finditer(pattern, clause):
                span = match.group()
                # A merely named entity/place is not enough: require assertion
                # structure or an observational/reporting verb.
                if not re.search(r'\bis\b|\bare\b|\bat\b|\bin\b|\bsee\b|\bseen\b|\bspot\b|\bstands\b|\bcontains\b|\bfound\b|\bplaces\b|\bsight\b|\bblocked\b|\bclear\b|\bopen\b|\bobstruct|\bunobstruct|\bsealed\b|\bfree\b', span):
                    continue
                positive = not bool(re.search(negative, span))
                claims[field].append((positive, reported))
                matched.append(dict(field=field, clause=clause, span=span, positive=positive, reported=reported))
    state = {}
    for field, supports in claims.items():
        signs = {sign for sign, _ in supports}
        if not supports: state[field] = 'unreported'
        elif len(signs) > 1: state[field] = 'conflicting'
        else:
            positive = next(iter(signs)); direct = any(not second for _,second in supports)
            state[field] = ('known' if positive else 'negated') if direct else ('suspected_positive' if positive else 'suspected_negative')
    policies = set(); policy_matches = []
    for clause in clauses:
        if '?' in clause or re.search(NONASSERTION, clause): continue
        for policy, pattern in POLICY.items():
            for match in re.finditer(pattern, clause):
                prefix = clause[max(0,match.start()-12):match.start()]
                if re.search(r'(?:do not|don.t|never)\s*$', prefix): continue
                policies.add(policy); policy_matches.append(dict(policy=policy, span=match.group(), clause=clause.strip()))
    state['policy'] = next(iter(policies)) if len(policies) == 1 else 'unclear'
    state['clarification'] = 'none'
    state['clarification'] = required_clarification(state)
    return dict(interpretation=state, matched_claims=matched, recognized_policies=sorted(policies), policy_matches=policy_matches, skipped_clauses=skipped)
