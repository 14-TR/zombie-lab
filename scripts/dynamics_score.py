"""Frozen ZL-018 parsing and scoring; no calls, retries or answer repair."""
import math


def probability(v):
    return type(v) in (int,float) and math.isfinite(v) and 0<=v<=1

def parse_response(request,body):
    if not isinstance(body,dict) or body.get('model')!='jev-1.13.0':
        raise ValueError('missing/wrong model')
    answers=body.get('answers')
    if not isinstance(answers,dict) or set(answers)!=set(request['questions']):
        raise ValueError('missing/extra questions')
    result={'1':{},'3':{}}
    for key,question in request['questions'].items():
        answer=answers[key]
        if not isinstance(answer,dict) or answer.get('type')!='choice': raise ValueError('malformed Choice')
        choices=question['criteria'];value=answer.get('choice');ps=answer.get('probabilities')
        if not isinstance(value,str) or value not in choices: raise ValueError('out of set Choice')
        if not probability(answer.get('confidence')): raise ValueError('invalid confidence')
        if not isinstance(ps,dict) or set(ps)!=set(choices) or not all(probability(v) for v in ps.values()):
            raise ValueError('invalid probability support')
        # Retain returned probabilities unchanged; allow worst-case two-decimal rounding.
        if abs(sum(ps.values())-1)>0.005*len(ps)+1e-9 or ps[value]+0.015<max(ps.values()):
            raise ValueError('invalid probability sum/argmax')
        tick,component=key.split('_',1)
        result[tick[1:]][component]=value
    return result

def score_state(prediction,truth):
    correct={k:prediction.get(k)==v for k,v in truth.items()}
    numeric=[k for k in truth if k!='world_caught' and isinstance(prediction.get(k),str) and prediction[k].isdigit()]
    errors={k:abs(int(prediction[k])-int(truth[k])) for k in numeric}
    return {'exact':all(correct.values()),'correctComponents':sum(correct.values()),'components':len(truth),
            'coordinateAbsoluteError':sum(errors.values()),'numericCoordinates':len(numeric),
            'componentCorrect':correct,'componentAbsoluteError':errors,
            'captureCorrect':correct['world_caught'],'unknown':sum(prediction.get(k)=='unknown' for k in truth),
            'missing':sum(k not in prediction for k in truth)}
