"""Check the shipped GLB/manifest contract without Blender or third-party libraries."""
from __future__ import annotations
import hashlib
import json
import math
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
PUBLIC=ROOT/"packages/client/public/isometric"
blob=(PUBLIC/"library.glb").read_bytes()
manifest=json.loads((PUBLIC/"manifest.json").read_text(encoding="utf-8"))
magic,version,length=struct.unpack_from("<4sII",blob)
assert (magic,version,length)==(b"glTF",2,len(blob)),"GLB header"
json_length,json_kind=struct.unpack_from("<II",blob,12)
assert json_kind==0x4e4f534a,"JSON chunk"
gltf=json.loads(blob[20:20+json_length])
binary_offset=20+json_length
binary_length,binary_kind=struct.unpack_from("<II",blob,binary_offset)
assert binary_kind==0x004e4942,"Binary chunk"
binary=blob[binary_offset+8:binary_offset+8+binary_length]
assert hashlib.sha256(blob).hexdigest()==manifest["glbSha256"],"Manifest hash"
assert len(blob)==manifest["glbBytes"]
assert not gltf.get("images") and not gltf.get("textures"),"No textures"
assert not gltf.get("skins") and not gltf.get("animations"),"Static library"
assert all("uri" not in b for b in gltf["buffers"]),"Self-contained GLB"
nodes=gltf["nodes"]
assert len(nodes)==manifest["assetCount"]==20
assert set(gltf["scenes"][gltf.get("scene",0)]["nodes"])==set(range(len(nodes))),"All roots"
expected={a["node"]:a for a in manifest["assets"]}
assert set(n["name"] for n in nodes)==set(expected),"Exact names"
materials=gltf["materials"]
assert "company_accent" in [m["name"] for m in materials]
assert len(materials)<=5,"Shader palette budget"

def accessor(index):
    acc=gltf["accessors"][index];view=gltf["bufferViews"][acc["bufferView"]]
    component={5126:("f",4),5125:("I",4),5123:("H",2),5121:("B",1)}[acc["componentType"]]
    width={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[acc["type"]]
    stride=view.get("byteStride",component[1]*width)
    start=view.get("byteOffset",0)+acc.get("byteOffset",0)
    return [struct.unpack_from("<"+component[0]*width,binary,start+i*stride) for i in range(acc["count"])]

triangles=0;groups=0
for n in nodes:
    assert "matrix" not in n and "translation" not in n and "rotation" not in n and "scale" not in n,"Identity roots"
    assert "children" not in n and "mesh" in n
    entry=expected[n["name"]];count=0;points=[]
    for prim in gltf["meshes"][n["mesh"]]["primitives"]:
        assert prim.get("mode",4)==4,"Triangles only"
        vertices=accessor(prim["attributes"]["POSITION"])
        assert all(math.isfinite(v) for point in vertices for v in point),"Finite positions"
        indices=accessor(prim["indices"])
        assert len(indices)%3==0 and max(i[0] for i in indices)<len(vertices),"Valid indices"
        count+=len(indices)//3;groups+=1;points.extend(vertices)
        if materials[prim["material"]]["name"]!="company_accent":
            assert "COLOR_0" in prim["attributes"],"Fixed tints use vertex colours"
    assert count==entry["triangles"],f"Triangle count: {n['name']}"
    for axis in range(3):
        assert abs(min(v[axis] for v in points)-entry["bounds"]["min"][axis])<.00002
        assert abs(max(v[axis] for v in points)-entry["bounds"]["max"][axis])<.00002
    triangles+=count
assert triangles==manifest["totalTriangles"]<100000
assert groups==manifest["materialGroups"]
print(json.dumps({"ok":True,"assets":len(nodes),"triangles":triangles,"primitives":groups,
                  "materials":len(materials),"bytes":len(blob),"sha256":manifest["glbSha256"]},indent=2))
