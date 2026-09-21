"""Frozen descriptive evaluator; no model access and no threshold fitting."""
from collections import Counter
from semantics_core import FACTS, OPTIONS, valid, assertions, controller, simulate


def evaluate(prediction, gold, world):
    valid_prediction = valid(prediction)
    pred = prediction if valid_prediction else {}
    component = {k:pred.get(k)==v for k,v in gold.items()}
    unsupported = [k for k in FACTS if pred.get(k) in ('known','negated') and pred[k]!=gold[k]]
    promotions = [k for k in unsupported if gold[k].startswith('suspected_')]
    guessed = [k for k in FACTS if gold[k]=='unreported' and pred.get(k) not in (None,'unreported')]
    decision = controller(prediction)
    gold_decision = controller(gold)
    trace = simulate(decision,world,gold['policy'])
    gold_trace = simulate(gold_decision,world,gold['policy'])
    moved = decision['action']=='move'
    covered = decision['action']!='ask'
    required = 'both' if pred.get('policy')=='unclear' and any(pred.get(k) in ('suspected_positive','suspected_negative','conflicting') for k in FACTS) else 'goal' if pred.get('policy')=='unclear' else 'evidence' if any(pred.get(k) in ('suspected_positive','suspected_negative','conflicting') for k in FACTS) else 'none'
    status_correct = polarity_correct = 0
    if valid_prediction:
        pa,ga=assertions(pred),assertions(gold)
        status_correct=sum(pa[k]['status']==ga[k]['status'] for k in FACTS)
        polarity_correct=sum(pa[k]['polarity']==ga[k]['polarity'] for k in FACTS)
    return dict(exact=valid_prediction and prediction==gold,component=component,components_correct=sum(component.values()),status_correct=status_correct,polarity_correct=polarity_correct,
                unsupported_assertions=len(unsupported),unsupported_fields=unsupported,suspected_promotions=len(promotions),unreported_claims=len(guessed),
                abstain=not covered,coverage=covered,moved=moved,false_action=moved and decision!=gold_decision,trace_match=trace==gold_trace,
                useful_coverage=covered and trace==gold_trace,malformed_or_missing=not valid_prediction,
                clarification_inconsistent=valid_prediction and pred['clarification']!=required,trace=trace,gold_trace=gold_trace)


def aggregate(rows):
    def summarize(selected):
        n=len(selected)
        metrics=[r['metrics'] for r in selected]
        groups={r['group'] for r in selected}
        moved=sum(m['moved'] for m in metrics)
        false=sum(m['false_action'] for m in metrics)
        return dict(n=n,exact=sum(m['exact'] for m in metrics),components_correct=sum(m['components_correct'] for m in metrics),components_total=n*len(OPTIONS),
                    component_correct={k:sum(m['component'][k] for m in metrics) for k in OPTIONS},
                    status_correct=sum(m['status_correct'] for m in metrics),polarity_correct=sum(m['polarity_correct'] for m in metrics),fact_components_total=n*len(FACTS),
                    groups_exact=sum(all(r['metrics']['exact'] for r in selected if r['group']==g) for g in groups),groups_total=len(groups),
                    unsupported_assertions=sum(m['unsupported_assertions'] for m in metrics),suspected_promotions=sum(m['suspected_promotions'] for m in metrics),
                    unreported_claims=sum(m['unreported_claims'] for m in metrics),abstentions=sum(m['abstain'] for m in metrics),coverage_n=sum(m['coverage'] for m in metrics),movement_n=moved,
                    false_actions=false,false_action_rate_all=false/n if n else None,false_action_rate_movement=false/moved if moved else None,
                    useful_coverage_n=sum(m['useful_coverage'] for m in metrics),trace_matches=sum(m['trace_match'] for m in metrics),
                    malformed_or_missing=sum(m['malformed_or_missing'] for m in metrics),clarification_inconsistent=sum(m['clarification_inconsistent'] for m in metrics),
                    outcomes=dict(Counter(m['trace']['outcome'] for m in metrics)),goals_completed=sum(m['trace']['goal_completed'] for m in metrics))
    return {'all':summarize(rows),**{stratum:summarize([r for r in rows if r['stratum']==stratum]) for stratum in sorted({r['stratum'] for r in rows})}}
