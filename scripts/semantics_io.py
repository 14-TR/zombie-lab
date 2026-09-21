"""Whitelisted on-wire inputs and strict response validation, no live I/O."""
import json
import math


def wire(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode('utf-8')


def request(case, spec, development):
    return {'model':'jev-1.13.0','state':{'text':case['text'],'scene_rules':spec['scene_rules'],'development_examples':[{'text':d['text'],'interpretation':d['interpretation']} for d in development]},'questions':spec['questions']}


def number(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and 0 <= value <= 1


def decode(raw, req):
    try:
        value=json.loads(raw)
        if not isinstance(value,dict) or value.get('model')!='jev-1.13.0': raise ValueError('model mismatch')
        answers=value['answers']
        if not isinstance(answers,dict) or set(answers)!=set(req['questions']): raise ValueError('answer fields mismatch')
        result={}
        for k,q in req['questions'].items():
            a=answers[k]
            if not isinstance(a,dict) or a.get('type')!='choice' or a.get('choice') not in q['criteria']: raise ValueError('invalid choice')
            p=a['probabilities']
            if not isinstance(p,dict) or set(p)!=set(q['criteria']) or not all(number(x) for x in p.values()): raise ValueError('invalid probabilities')
            # API rounds to two decimals; do not repair returned values.
            if abs(sum(p.values())-1)>len(p)*0.005+1e-8 or p[a['choice']]+0.015<max(p.values()): raise ValueError('invalid distribution')
            if not number(a['confidence']): raise ValueError('invalid confidence')
            result[k]=a['choice']
        usage=value['usage']
        if not isinstance(usage,dict) or any(type(usage.get(k)) is not int or usage[k]<0 for k in ('input_tokens','output_tokens')): raise ValueError('invalid usage')
        return result
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError('malformed response') from error
