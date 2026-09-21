"""ZL020 wire decoder. No duplicate keys, nonfinite JSON or non-argmax Choices."""
import json
from semantics_io import decode as historical_decode, wire, request


def unique_object(pairs):
    out = {}
    for key, value in pairs:
        if key in out: raise ValueError('duplicate JSON key')
        out[key] = value
    return out


def reject_constant(_value):
    raise ValueError('nonfinite JSON')


def loads(raw):
    return json.loads(raw, object_pairs_hook=unique_object, parse_constant=reject_constant)


def decode(raw, req):
    value = loads(raw)
    result = historical_decode(wire(value), req)
    # Rounded ties allowed, but even 0.01 below a competitor is rejected.
    # Sum tolerance remains <= 0.005 per rounded option plus numerical epsilon.
    for answer in value['answers'].values():
        p = answer['probabilities']
        if p[answer['choice']] < max(p.values()):
            raise ValueError('Choice is not a reported argmax')
    return result
