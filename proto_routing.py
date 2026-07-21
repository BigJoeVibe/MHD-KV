# -*- coding: utf-8 -*-
# PROTOTYP logiky hledani spojeni A->B nad sitovym modelem.
# SEED = vzorek KV z popisu uzivatele + projektu (ilustrativni kostra, [k overeni]).
# Cil: overit, ze routing (primo + 1 prestup) funguje na realnych scenarich uzivatele.

# Kazda "pattern" = jedna linka x jeden smer x poradi zastavek (jako GTFS trip pattern).
patterns = {
 "3>":  ["Kratka","Rozcesti u konicka","Trznice"],
 "9>":  ["Kratka","Trznice"],
 "13>": ["Okruzni","Rozcesti u konicka","Trznice","Horni nadrazi"],
 "15>": ["Okruzni","Rozcesti u konicka","Trznice"],
 "51>": ["Okruzni","Trznice","Horni nadrazi"],   # nocni
 "11>": ["Trznice","Horni nadrazi"],
 "1>":  ["Rozcesti u konicka","Horni nadrazi"],
 "5>":  ["Trznice","Ruzovy vrch"],
 "19>": ["Trznice","Ruzovy vrch"],
}
line_of = {k: k.rstrip(">") for k in patterns}

def stops_after(pat, s):
    seq = patterns[pat]
    return seq[seq.index(s)+1:] if s in seq else []

def lines_through(s):
    return [p for p in patterns if s in patterns[p]]

def search(A, B, max_transfers=1):
    res = []
    for p in patterns:                       # primo
        if B in stops_after(p, A):
            res.append({"t":0,"legs":[(line_of[p],A,B)]})
    if max_transfers >= 1:                    # 1 prestup
        for p1 in patterns:
            for T in stops_after(p1, A):
                if T == B: continue
                for p2 in lines_through(T):
                    if line_of[p2] == line_of[p1]: continue
                    if B in stops_after(p2, T):
                        res.append({"t":1,"legs":[(line_of[p1],A,T),(line_of[p2],T,B)]})
    seen, out = set(), []
    for r in sorted(res, key=lambda r:(r["t"], len(str(r["legs"])))):
        k = str(r["legs"])
        if k not in seen:
            seen.add(k); out.append(r)
    return out

def fmt(r):
    if r["t"] == 0:
        ln,a,b = r["legs"][0]; return f"primo linkou {ln}: {a} -> {b}"
    return "1 prestup: " + "  ==>  ".join(f"linka {ln} ({a}->{b})" for ln,a,b in r["legs"])

demos = [("Kratka","Trznice"),("Kratka","Horni nadrazi"),
         ("Okruzni","Horni nadrazi"),("Okruzni","Ruzovy vrch"),("Kratka","Ruzovy vrch")]
for A,B in demos:
    print(f"\n> {A} -> {B}")
    rs = search(A,B)
    print("   (zadne spojeni ve vzorku)" if not rs else "")
    for r in rs: print("   -", fmt(r))
