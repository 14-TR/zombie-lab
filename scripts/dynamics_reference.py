"""Independent coordinate-sign reference from ZL-018 protocol.

No import of production or primary dynamics. Uses axis relations, not candidate
minimization. Same author, different algorithm: not a blind external review.
"""

def touching(h,z):
    return (h[0]==z[0] and abs(h[1]-z[1])<=1) or (h[1]==z[1] and abs(h[0]-z[0])<=1)

def step(state,command,law,width,height):
    h=state['H'][:]
    zs=[state['Z1'][:],state['Z2'][:]]
    if state['caught'] or any(touching(h,z) for z in zs):
        return {'H':h,'Z1':zs[0],'Z2':zs[1],'caught':True}
    hx,hy=h
    if command=='N': hy=max(0,hy-1)
    elif command=='E': hx=min(width-1,hx+1)
    elif command=='S': hy=min(height-1,hy+1)
    elif command=='W': hx=max(0,hx-1)
    elif command!='stay': raise ValueError('command')
    target=[hx,hy] if law=='new_NESW' else h
    output=[]
    for x,y in zs:
        if law=='stationary': output.append([x,y]);continue
        if law not in ['old_NESW','old_WSEN','new_NESW']: raise ValueError('law')
        if law=='old_WSEN':
            if target[0]<x: x-=1
            elif target[1]>y: y+=1
            elif target[0]>x: x+=1
            elif target[1]<y: y-=1
        else:
            if target[1]<y: y-=1
            elif target[0]>x: x+=1
            elif target[1]>y: y+=1
            elif target[0]<x: x-=1
        output.append([x,y])
    return {'H':[hx,hy],'Z1':output[0],'Z2':output[1],
            'caught':any(touching([hx,hy],z) for z in output)}

def frames(start,actions,law,width,height):
    current={k:(v[:] if isinstance(v,list) else v) for k,v in start.items()}
    current['caught']=bool(current['caught'] or any(touching(current['H'],current[z]) for z in ['Z1','Z2']))
    result=[current]
    for command in actions:
        current=step(current,command,law,width,height)
        result.append(current)
    return result
