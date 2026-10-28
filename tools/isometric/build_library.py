"""Original Casholoco industrial diorama kit, generated with Blender 4.5 LTS.

blender --background --factory-startup --python tools/isometric/build_library.py
All modelling helpers use runtime coordinates: X right, Y up, Z forward.
One world unit = one parcel. Roots sit at ground centre, face runtime +Z.
No textures, external models, fonts or network resources are required.
"""
from __future__ import annotations
import json
import math
import hashlib
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "packages/client/public/isometric"
SOURCE = ROOT / "art_sources/isometric"
PUBLIC.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

def p(v): return (v[0], -v[2], v[1])

def mat(name, color, metal=0.0, rough=0.6, emission=0.0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bsdf=m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Metallic"].default_value=metal
    bsdf.inputs["Roughness"].default_value=rough
    if emission:
        bsdf.inputs["Emission Color"].default_value=(*color,1)
        bsdf.inputs["Emission Strength"].default_value=emission
    return m

M={
 "accent":mat("company_accent",(.94,.38,.20)),
 "cream":mat("warm_limestone",(.83,.78,.63)),
 "white":mat("porcelain_enamel",(.91,.91,.80),.08,.42),
 "brick":mat("terracotta_brick",(.56,.25,.16)),
 "roof":mat("slate_blue_roof",(.16,.27,.33),.18,.55),
 "copper":mat("burnished_copper",(.69,.35,.15),.65,.35),
 "steel":mat("brushed_steel",(.56,.64,.61),.65,.36),
 "iron":mat("deep_iron",(.10,.16,.18),.42,.5),
 "glass":mat("opaque_turquoise_glass",(.11,.39,.43),.3,.2),
 "glass2":mat("sky_window_reflection",(.37,.66,.67),.15,.23),
 "wood":mat("honey_timber",(.55,.37,.19)),
 "asphalt":mat("warm_asphalt",(.28,.31,.29)),
 "concrete":mat("sandy_concrete",(.60,.61,.51)),
 "sand":mat("golden_mine_sand",(.71,.59,.37)),
 "lithium":mat("mint_lithium_ore",(.45,.66,.55)),
 "green":mat("olive_canopy",(.29,.44,.22)),
 "green2":mat("sage_canopy",(.44,.56,.27)),
 "grass":mat("garden_sage",(.46,.57,.32)),
 "gold":mat("harvest_gold",(.89,.66,.22)),
 "black":mat("rubber",(.08,.10,.10)),
 "light":mat("warm_lamps",(1.0,.73,.33),0,.4,.5),
 "teal":mat("data_status_teal",(.19,.79,.69),.2,.35,.35),
 "red":mat("safety_red",(.74,.16,.09)),
 "skin":mat("warm_skin",(.73,.48,.30)),
}
parts=[];assets=[]

# Share a small shader palette while keeping every original face tint in COLOR_0.
# The owner accent stays a separate material with white vertex colours.
PALETTE={}
for key,metal,rough,glow in [("matte",0,.65,0),("metal",.58,.38,0),("glass",.25,.22,0),("glow",0,.4,.3)]:
    pm=mat("miniature_palette_"+key,(1,1,1),metal,rough,glow)
    node=pm.node_tree.nodes.new("ShaderNodeVertexColor");node.layer_name="KitColor"
    bsdf=pm.node_tree.nodes.get("Principled BSDF")
    pm.node_tree.links.new(node.outputs["Color"],bsdf.inputs["Base Color"])
    if glow:pm.node_tree.links.new(node.outputs["Color"],bsdf.inputs["Emission Color"])
    PALETTE[key]=pm

def pack_palette(o):
    original=list(o.data.materials)
    colors=o.data.color_attributes.new(name="KitColor",type="FLOAT_COLOR",domain="CORNER")
    used=[];indices=[]
    for poly in o.data.polygons:
        old=original[poly.material_index]
        if old.name=="company_accent":
            target=old;color=(1,1,1,1)
        else:
            bsdf=old.node_tree.nodes.get("Principled BSDF")
            metal=bsdf.inputs["Metallic"].default_value;rough=bsdf.inputs["Roughness"].default_value
            key="glow" if old.name in ["warm_lamps","data_status_teal"] else "metal" if metal>=.4 else "glass" if rough<.3 else "matte"
            target=PALETTE[key];color=tuple(old.diffuse_color)
        if target not in used:used.append(target)
        indices.append(used.index(target))
        for li in poly.loop_indices:colors.data[li].color=color
    o.data.materials.clear()
    for material in used:o.data.materials.append(material)
    for poly,index in zip(o.data.polygons,indices):poly.material_index=index

def finish(o,material,name):
    o.name=name;o.data.materials.append(M[material] if isinstance(material,str) else material);parts.append(o);return o

def box(name,pos,size,material="cream",bevel=.002,rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p(pos));o=bpy.context.object
    o.dimensions=(size[0],size[2],size[1])
    if rotation:o.rotation_euler=rotation
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel>0:
        mod=o.modifiers.new("Soft miniature edges","BEVEL");mod.width=min(bevel,min(size)*.3);mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,material,name)

def cyl(name,pos,radius,height,material="steel",vertices=16,direction=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=height,location=p(pos));o=bpy.context.object
    if direction is not None:o.rotation_euler=Vector(p(direction)).to_track_quat("Z","Y").to_euler()
    for poly in o.data.polygons:poly.use_smooth=len(poly.vertices)==4
    return finish(o,material,name)

def cone(name,pos,r1,r2,h,material="steel",vertices=16):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=h,location=p(pos))
    return finish(bpy.context.object,material,name)

def ico(name,pos,scale,material="green",subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions,radius=1,location=p(pos));o=bpy.context.object
    o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,material,name)

def rod(name,a,b,radius=.005,material="steel",vertices=8):
    aa,bb=Vector(a),Vector(b);return cyl(name,(aa+bb)/2,radius,(bb-aa).length,material,vertices,bb-aa)

def beam(name,a,b,width=.012,material="iron"):
    aa,bb=Vector(p(a)),Vector(p(b));o=box(name,(0,0,0),(width,(bb-aa).length,width),material,.001)
    o.location=(aa+bb)/2;o.rotation_euler=(bb-aa).to_track_quat("Z","Y").to_euler();return o

def mesh(name,points,faces,material):
    data=bpy.data.meshes.new(name);data.from_pydata([p(v) for v in points],[],faces);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);return finish(o,material,name)

def roof(x,z,w,d,y,ridge=.065,material="roof"):
    mesh("pitched_roof",[(x-w/2,y,z-d/2),(x+w/2,y,z-d/2),(x,y+ridge,z-d/2),
        (x-w/2,y,z+d/2),(x+w/2,y,z+d/2),(x,y+ridge,z+d/2)],
        [(0,3,5,2),(2,5,4,1),(0,2,1),(3,4,5),(0,1,4,3)],material)
    rod("roof_ridge",(x,y+ridge+.001,z-d/2),(x,y+ridge+.001,z+d/2),.004,"steel")
    for zz in [-.35,-.12,.12,.35]:
        z0=z+zz*d
        rod("standing_seam",(x-w/2,y+.002,z0),(x,y+ridge+.002,z0),.0017,"steel",6)
        rod("standing_seam",(x,y+ridge+.002,z0),(x+w/2,y+.002,z0),.0017,"steel",6)

def slab(w=.74,d=.66,material="concrete"):
    box("parcel_plinth",(0,.012,0),(w,.024,d),material,.008)
    box("front_pavement",(0,.026,d/2-.036),(w-.025,.008,.055),"cream",.002)
    for xx in [-.25,-.12,0,.12,.25]:
        if abs(xx)<w/2:box("kerb_divider",(xx,.030,d/2-.036),(.002,.002,.05),"concrete",0)

def window_front(x,y,z,w=.045,h=.047):
    box("window_frame",(x,y,z),(w+.008,h+.008,.008),"white",.001)
    box("blue_glass",(x,y,z+.005),(w,h,.003),"glass",0)
    box("window_reflection",(x-w*.14,y+h*.25,z+.007),(w*.20,h*.28,.001),"glass2",0)
    box("window_mullion",(x,y,z+.008),(.003,h,.002),"steel",0)

def window_side(x,y,z,w=.045,h=.047):
    box("side_window_frame",(x,y,z),(.008,h+.008,w+.008),"white",.001)
    box("side_blue_glass",(x+.005,y,z),(.003,h,w),"glass",0)
    box("side_window_mullion",(x+.007,y,z),(.002,h,.003),"steel",0)

def door(x,z,y=.10,w=.065,h=.10):
    box("door_reveal",(x,y,z),(w+.015,h+.012,.011),"iron",.001)
    box("door",(x,y,z+.008),(w,h,.008),"accent",.001)
    box("handle",(x+w*.30,y,z+.014),(.003,.013,.003),"steel",0)
    box("porch_lamp",(x,y+h*.68,z+.020),(.018,.009,.018),"light",.002)

def loading(x,z,y=.094,w=.12,h=.12):
    box("dock_surround",(x,y,z),(w+.018,h+.014,.015),"iron",.002)
    box("rolling_shutter",(x,y,z+.009),(w,h,.008),"steel",.001)
    for i in range(6):box("shutter_slat",(x,y-h/2+(i+.5)*h/6,z+.015),(w-.004,.0018,.002),"roof",0)
    box("loading_dock",(x,.043,z+.045),(w+.045,.028,.075),"concrete",.003)
    for xx in [x-w/2-.014,x+w/2+.014]:
        cyl("safety_bollard",(xx,.065,z+.075),.006,.055,"gold",8)
        cyl("bollard_band",(xx,.073,z+.075),.0063,.011,"black",8)

def tank(x,z,r=.048,h=.20,material="white",base=.025):
    for dx in [-r*.6,r*.6]:rod("tank_leg",(x+dx,base,z),(x+dx,base+.035,z),.006,"iron")
    cyl("storage_tank",(x,base+.035+h/2,z),r,h,material,24)
    cone("tank_dome",(x,base+.035+h+.010,z),r,r*.60,.022,material,24)
    for yy in [.18,.65]:cyl("tank_steel_band",(x,base+.035+h*yy,z),r+.002,.007,"steel",24)
    rod("tank_valve",(x+r,base+.065,z),(x+r+.020,base+.065,z),.005,"copper")
    cyl("inspection_hatch",(x,base+.035+h+.025,z),r*.26,.009,"iron",12)

def pallet(x,z,kind="crate"):
    for zz in [-.023,.023]:box("pallet_runner",(x,.034,z+zz),(.075,.012,.013),"wood",.001)
    for xx in [-.028,0,.028]:box("pallet_plank",(x+xx,.043,z),(.018,.005,.065),"wood",.001)
    if kind=="drum":
        for xx in [-.018,.018]:
            cyl("barrel",(x+xx,.069,z),.015,.045,"accent",12)
            cyl("barrel_rim",(x+xx,.093,z),.016,.003,"steel",12)
    else:
        box("shipping_carton",(x,.074,z),(.058,.056,.049),"wood",.002)
        box("crate_strap",(x,.074,z+.025),(.007,.055,.002),"iron",0)
        box("crate_strap",(x,.103,z),(.007,.002,.05),"iron",0)

def sign(x,y,z,width=.10):
    box("company_sign",(x,y,z),(width,.031,.009),"accent",.003)
    for i in range(3):box("sign_mark",(x-width*.30+i*width*.23,y,z+.006),(width*.12,.010,.002),"white",0)

def scooter(x,z):
    for zz in [z-.026,z+.026]:cyl("scooter_wheel",(x,.043,zz),.014,.008,"black",12,(1,0,0))
    box("scooter_deck",(x,.048,z),(.016,.008,.052),"accent",.001)
    rod("handle_stem",(x,.055,z+.025),(x,.102,z+.018),.003,"steel")
    rod("handlebar",(x-.018,.102,z+.018),(x+.018,.102,z+.018),.003,"iron")

def assemble(name):
    global parts
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    o.name=name;o.data.name=name+"_geometry"
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    o["parcel_units"]=1.0;o["front_axis"]="+Z glTF";o["original_asset"]=True
    pack_palette(o)
    parts=[];assets.append(o);return o

def factory(kind):
    slab()
    if kind=="energy_drinks":
        box("bottling_hall",(-.07,.147,-.03),(.43,.24,.43),"cream",.005)
        roof(-.07,-.03,.46,.46,.275,.065,"accent")
        box("brick_foundation",(-.07,.058,-.03),(.438,.055,.438),"brick",.002)
        for xx in [-.23,-.13,-.03,.07]:window_front(xx,.208,.19,.055,.055)
        loading(-.12,.19,.105);door(.065,.19,.086,.045,.092)
        for zz in [-.16,.0,.16]:tank(.25,zz,.046,.20,"copper")
        rod("tank_header",(.25,.10,-.20),(.25,.10,.21),.008,"steel")
        rod("feed_pipe",(.12,.10,-.20),(.25,.10,-.20),.008,"steel")
        cyl("short_chimney",(-.20,.38,-.15),.017,.17,"steel",16)
        cyl("chimney_cap",(-.20,.468,-.15),.024,.009,"iron",16)
        pallet(-.27,.265,"drum");sign(-.08,.257,.20,.12)
    elif kind=="gadgets":
        box("precision_hall",(-.05,.15,-.04),(.55,.25,.40),"white",.005)
        box("flat_roof",(-.05,.285,-.04),(.59,.025,.44),"roof",.004)
        box("glass_ribbon",(-.05,.208,.163),(.53,.055,.008),"glass",.001)
        for xx in [-.29,-.20,-.11,-.02,.07,.16]:
            box("facade_pier",(xx,.15,.173),(.010,.24,.014),"white",.001)
            window_side(.23,.195,-.15+abs(xx)*.65,.045,.045)
        loading(-.15,.17,.10,.14,.10);door(.14,.175,.092,.048,.108)
        for xx in [-.22,-.08,.06]:
            box("solar_frame",(xx,.306,-.07),(.11,.012,.24),"steel",.001)
            box("solar_cells",(xx,.315,-.07),(.102,.004,.23),"glass",0)
            for zz in [-.14,-.07,0]:box("solar_grid",(xx,.318,zz),(.102,.001,.002),"glass2",0)
        box("cleanroom_vent",(.25,.13,-.16),(.12,.21,.12),"steel",.003)
        for yy in [.07,.10,.13,.16,.19]:box("vent_louvre",(.313,yy,-.16),(.003,.009,.10),"iron",0)
        pallet(-.28,.26);sign(.07,.258,.183,.13)
    elif kind=="scooters":
        box("assembly_works",(-.03,.15,-.04),(.58,.25,.42),"brick",.004)
        for zz in [-.17,-.035,.10]:
            roof(-.03,zz,.61,.135,.282,.058,"roof")
            box("northlight_glazing",(-.03,.311,zz-.065),(.48,.036,.005),"glass2",0)
        for xx in [-.265,-.17,-.075,.02,.115,.21]:window_front(xx,.206,.176,.06,.054)
        loading(-.12,.18,.10,.16,.11);door(.16,.18,.09,.05,.105)
        box("assembly_canopy",(-.05,.145,.26),(.48,.014,.115),"accent",.003)
        for xx in [-.27,.17]:rod("canopy_column",(xx,.03,.30),(xx,.145,.30),.004,"iron")
        for xx in [-.16,-.055,.05]:scooter(xx,.27)
        cyl("exhaust_stack",(.22,.345,-.18),.018,.17,"steel",12);sign(.09,.257,.184,.13)
    elif kind=="yogurts":
        box("dairy_hall",(-.09,.155,-.04),(.43,.26,.43),"cream",.006)
        roof(-.09,-.04,.46,.46,.293,.064,"roof")
        box("enamel_tile_band",(-.09,.097,.181),(.43,.045,.009),"glass",0)
        for xx in [-.24,-.14,-.04,.06]:window_front(xx,.215,.18,.055,.062)
        loading(-.13,.185,.10,.13,.11);door(.06,.185,.09,.048,.11)
        for zz in [-.17,-.015,.14]:tank(.235,zz,.053,.25,"white")
        rod("milk_header",(.235,.16,-.22),(.235,.16,.20),.009,"steel")
        rod("milk_feed",(.12,.16,-.22),(.235,.16,-.22),.009,"steel")
        box("cold_store",(-.26,.105,-.19),(.13,.15,.12),"white",.004)
        sign(-.09,.275,.188,.14);pallet(-.265,.27)
    else:
        box("data_hall",(-.035,.17,-.03),(.59,.29,.43),"iron",.006)
        box("white_roof",(-.035,.323,-.03),(.62,.018,.46),"white",.003)
        for xx in [-.285,-.215,-.145,-.075,-.005,.065,.135,.205]:
            box("server_glass_blade",(xx,.175,.189),(.041,.20,.009),"glass",.001)
            box("server_status",(xx,.253,.195),(.024,.005,.002),"teal",0)
            box("lower_status",(xx,.105,.195),(.018,.004,.002),"light",0)
        for zz in [-.16,-.025,.11]:
            box("rooftop_air_handler",(-.17,.359,zz),(.21,.055,.095),"steel",.003)
            for xx in [-.22,-.12]:
                cyl("cooling_fan",(xx,.391,zz),.035,.009,"iron",16)
                rod("fan_cross",(xx-.027,.398,zz),(xx+.027,.398,zz),.002,"steel")
        for xx in [.04,.11,.18]:rod("coolant_pipe",(xx,.35,-.20),(xx,.35,.17),.009,"copper")
        door(.23,.198,.085,.04,.1);sign(-.04,.303,.20,.13)
        box("power_transformer",(.285,.10,-.12),(.09,.15,.15),"steel",.003)
        for yy in [.055,.08,.105,.13]:box("transformer_fin",(.336,yy,-.12),(.007,.012,.13),"iron",0)
    return assemble("asset_factory_"+kind)

def site(kind):
    slab(.68,.62,"sand" if kind in ["oil","lithium"] else "concrete")
    if kind=="oil":
        box("pump_house",(-.20,.085,-.14),(.19,.12,.17),"cream",.003)
        roof(-.20,-.14,.22,.20,.155,.040,"roof");door(-.20,-.05,.08,.05,.09)
        for zz in [-.08,.10]:
            for xx in [.00,.14]:beam("pump_trestle",(xx-.025,.03,zz),(xx+.015,.29,zz),.013,"iron")
        beam("walking_beam",(-.07,.31,.01),(.245,.38,.01),.026,"accent")
        beam("horsehead",(.245,.38,.01),(.263,.28,.01),.038,"iron")
        rod("polished_rod",(.263,.07,.01),(.263,.32,.01),.004,"steel")
        box("pump_motor",(.01,.082,.02),(.095,.09,.12),"roof",.004)
        cyl("flywheel",(.025,.14,.085),.05,.012,"copper",20,(0,0,1))
        tank(-.17,.16,.080,.18,"white")
        rod("oil_pipeline",(-.17,.067,.16),(.26,.067,.16),.010,"iron");sign(-.19,.144,-.043,.105)
    elif kind=="lithium":
        for i in range(3):box("mine_terrace",(-.09,.04+i*.020,-.045),(.47-i*.085,.040,.39-i*.065),"lithium",.008)
        for x,z,s in [(-.21,-.1,.06),(-.12,-.15,.07),(.00,-.13,.05),(-.03,.04,.07),(-.21,.04,.045)]:
            ico("ore_outcrop",(x,.125,z),(s,s*.65,s*.7),"lithium",1)
        box("crusher_frame",(.20,.14,-.14),(.17,.22,.17),"iron",.002)
        cone("crusher_hopper",(.20,.267,-.14),.04,.105,.085,"accent",4)
        rod("conveyor_belt",(-.08,.14,.05),(.20,.20,-.10),.028,"black",4)
        for xx in [-.12,.02,.17]:beam("conveyor_support",(xx,.03,.08-xx*.5),(xx,.14+xx*.15,.08-xx*.5),.010,"steel")
        box("site_office",(.19,.085,.17),(.20,.12,.11),"white",.003)
        window_front(.17,.11,.229,.07,.035);door(.24,.229,.075,.035,.07)
    elif kind=="sugar":
        for xx in [-.19,-.045,.10]:tank(xx,-.11,.065,.29,"cream")
        box("refinery_hall",(-.05,.10,.12),(.45,.15,.17),"white",.004)
        roof(-.05,.12,.48,.20,.185,.045,"accent")
        for xx in [-.20,-.08,.04,.16]:window_front(xx,.13,.209,.05,.04)
        loading(-.07,.211,.08,.10,.09)
        for zz in [-.17,-.05,.07,.19]:
            box("sugarcane_bed",(.27,.035,zz),(.065,.012,.10),"wood",.001)
            for xx in [.251,.271,.291]:rod("sugar_cane",(xx,.04,zz),(xx,.14,zz-.012),.003,"gold",6)
        rod("silo_gantry",(-.24,.36,-.11),(.15,.36,-.11),.009,"steel");sign(-.05,.17,.218,.1)
    else:
        box("wafer_cleanroom",(-.04,.15,-.04),(.52,.25,.37),"white",.006)
        box("sealed_roof",(-.04,.287,-.04),(.55,.025,.40),"roof",.003)
        for xx in [-.23,-.13,-.03,.07,.17]:window_front(xx,.19,.153,.056,.09)
        for xx in [-.22,-.08,.06]:
            box("hepa_roof_plant",(xx,.326,-.06),(.095,.06,.23),"steel",.003)
            for zz in [-.14,-.09,-.04,.01]:box("hepa_louvre",(xx,.358,zz),(.075,.003,.014),"iron",0)
        door(.14,.16,.09,.045,.11)
        tank(.27,-.13,.038,.24,"white");tank(.27,.02,.038,.19,"steel")
        box("wafer_emblem_base",(-.19,.117,.159),(.074,.065,.009),"iron",.002)
        cyl("silicon_wafer",(-.19,.117,.167),.025,.003,"copper",20,(0,0,1));sign(-.04,.261,.16,.11)
    return assemble("asset_site_"+kind)

for kind in ["energy_drinks","gadgets","scooters","yogurts","crypto"]:factory(kind)
for kind in ["oil","lithium","sugar","chips"]:site(kind)

box("extension_floor",(0,.014,0),(.24,.028,.43),"concrete",.005)
box("new_warehouse",(0,.115,-.02),(.21,.18,.37),"cream",.004)
roof(0,-.02,.235,.40,.212,.040,"roof");loading(0,.171,.087,.12,.10)
for zz in [-.12,0,.11]:window_side(.108,.15,zz,.055,.046)
assemble("asset_extension_warehouse")
for xx in [-.05,.055]:tank(xx,0,.045,.19,"steel",.006)
rod("extension_tank_header",(-.06,.065,.05),(.07,.065,.05),.006,"copper")
assemble("asset_extension_tanks")

slab(.63,.54)
for xx in [-.23,.05]:
    for zz in [-.18,.12]:beam("upright",(xx,.03,zz),(xx,.30,zz),.012,"wood")
for yy in [.14,.28]:
    for zz in [-.18,.12]:beam("floor_girder",(-.23,yy,zz),(.05,yy,zz),.013,"wood")
    for xx in [-.23,.05]:beam("floor_crossbeam",(xx,yy,-.18),(xx,yy,.12),.012,"wood")
beam("diagonal_brace",(-.23,.04,.12),(.05,.27,.12),.009,"steel")
for yy in [.08,.18,.28,.38]:
    box("crane_mast",(.21,yy,-.16),(.045,.08,.045),"gold",.001)
    beam("crane_lattice",(.184,yy-.04,-.134),(.236,yy+.04,-.134),.005,"iron")
beam("crane_jib",(-.27,.42,-.16),(.29,.42,-.16),.018,"gold")
rod("crane_cable",(-.21,.42,-.16),(-.21,.19,-.16),.002,"iron")
box("hook_block",(-.21,.185,-.16),(.025,.025,.025),"gold",.002)
for xx in [-.22,-.12,-.02,.08]:box("barrier",(xx,.065,.245),(.075,.055,.015),"accent",.002)
pallet(.19,.14);assemble("asset_construction")

box("truck_chassis",(0,.035,0),(.083,.020,.205),"iron",.002)
box("cargo_body",(0,.083,-.035),(.088,.080,.135),"white",.004)
box("cargo_stripe",(.045,.081,-.035),(.002,.018,.12),"accent",0)
box("cab",(0,.071,.074),(.085,.068,.065),"accent",.004)
box("windscreen",(0,.087,.108),(.068,.027,.003),"glass",.001)
for xx in [-.044,.044]:
    box("cab_sideglass",(xx,.087,.077),(.003,.027,.035),"glass2",.001)
    for zz in [-.08,-.035,.072]:cyl("truck_tyre",(xx,.028,zz),.023,.014,"black",16,(1,0,0))
    for zz in [-.08,-.035,.072]:cyl("wheel_hub",(xx*1.18,.028,zz),.010,.003,"steel",12,(1,0,0))
for xx in [-.026,.026]:box("headlight",(xx,.052,.109),(.017,.011,.003),"light",.001)
box("truck_grille",(0,.05,.11),(.024,.014,.004),"iron",.001);assemble("asset_truck")

for xx in [-.006,.006]:
    beam("trouser_leg",(xx,.003,0),(xx,.030,0),.008,"roof")
    box("shoe",(xx,.004,.004),(.009,.007,.015),"iron",.001)
cone("coat",(0,.044,0),.014,.010,.032,"accent",8)
ico("head",(0,.071,0),(.010,.012,.010),"skin",2)
cone("hard_hat",(0,.083,0),.013,.008,.009,"gold",12)
beam("left_arm",(-.012,.053,0),(-.017,.031,.006),.006,"accent")
beam("right_arm",(.012,.053,0),(.017,.032,-.006),.006,"accent");assemble("asset_person")

mesh("freighter_hull",[(-.063,.030,-.15),(.063,.030,-.15),(.063,.030,.095),(0,.030,.17),(-.063,.030,.095),
    (-.050,.005,-.14),(.050,.005,-.14),(.050,.005,.08),(0,.005,.15),(-.050,.005,.08)],
    [(0,1,2,3,4),(5,9,8,7,6),(0,5,6,1),(1,6,7,2),(2,7,8,3),(3,8,9,4),(4,9,5,0)],"roof")
box("ship_deck",(0,.035,-.018),(.115,.015,.27),"cream",.002)
box("bridge",(0,.073,-.108),(.096,.07,.065),"white",.003)
box("bridge_windows",(0,.087,-.071),(.08,.023,.004),"glass",.001)
box("bridge_roof",(0,.113,-.108),(.105,.012,.075),"roof",.002)
cyl("funnel",(.024,.126,-.12),.012,.039,"accent",12)
for xx in [-.03,.03]:
    for zz in [-.02,.055]:
        box("container",(xx,.069,zz),(.05,.050,.065),"accent" if xx<0 else "green2",.002)
        for dz in [-.02,0,.02]:box("container_rib",(xx+.026,.069,zz+dz),(.002,.046,.003),"steel",0)
rod("mast",(0,.042,.11),(0,.18,.11),.003,"steel")
rod("antenna",(-.03,.16,.11),(.03,.16,.11),.002,"steel");assemble("asset_boat")

cyl("tree_trunk",(0,.07,0),.012,.14,"wood",8)
for xx,yy,zz,ss,ma in [(-.035,.15,0,.057,"green"),(.025,.17,.018,.061,"green2"),(0,.205,-.014,.049,"green")]:
    ico("tree_crown",(xx,yy,zz),(ss,ss*.9,ss),ma,2)
assemble("asset_tree")
cyl("pine_trunk",(0,.055,0),.009,.11,"wood",8)
for yy,r in [(.10,.065),(.155,.053),(.205,.038)]:cone("pine_bough",(0,yy,0),r,0,.10,"green",8)
assemble("asset_tree_pine")

box("house_walls",(0,.065,0),(.135,.13,.12),"cream",.003)
roof(0,0,.16,.145,.132,.055,"brick");door(-.03,.064,.045,.027,.06)
window_front(.035,.080,.064,.032,.032);window_side(.07,.080,-.018,.036,.037)
box("chimney",(.043,.186,-.034),(.025,.07,.026),"brick",.001)
box("front_step",(-.03,.010,.085),(.055,.020,.045),"concrete",.002);assemble("asset_house")

box("quay",(0,.026,0),(.69,.052,.48),"concrete",.006)
for xx in [-.28,-.14,0,.14,.28]:
    cyl("quay_pile",(xx,.020,.23),.014,.11,"wood",10)
    cyl("mooring_bollard",(xx,.071,.19),.011,.036,"iron",10)
for zz in [.14,.175,.21]:box("quay_plank",(0,.056,zz),(.67,.010,.027),"wood",.001)
box("port_warehouse",(-.11,.145,-.085),(.38,.18,.25),"cream",.004)
roof(-.11,-.085,.415,.28,.24,.07,"roof");loading(-.11,.045,.11,.15,.11)
for xx in [-.24,.02]:window_front(xx,.18,.046,.055,.05)
for zz in [-.13,-.02]:
    box("dock_container",(.23,.10,zz),(.14,.09,.095),"accent",.003)
    for xx in [.18,.21,.24,.27]:box("cargo_rib",(xx,.10,zz+.049),(.003,.08,.002),"steel",0)
beam("harbor_crane_mast",(.26,.05,.16),(.26,.38,.16),.022,"gold")
beam("harbor_crane_boom",(.26,.38,.16),(.07,.43,.29),.018,"gold")
rod("harbor_hook_cable",(.07,.43,.29),(.07,.18,.29),.002,"iron")
sign(-.11,.220,.054,.14);assemble("asset_port")

box("civic_podium",(0,.025,0),(.38,.05,.32),"cream",.005)
box("civic_building",(0,.135,-.015),(.28,.20,.21),"white",.003)
roof(0,-.015,.32,.25,.24,.065,"roof")
for xx in [-.105,-.035,.035,.105]:
    cyl("civic_column",(xx,.125,.11),.010,.18,"cream",12)
    window_front(xx,.165,-.124,.034,.06)
for i in range(3):box("civic_steps",(0,.012+i*.010,.145-i*.015),(.30,.020,.07),"cream",.002)
assemble("asset_civic")

bpy.ops.object.select_all(action="DESELECT");manifest=[]
for o in assets:
    o.select_set(True);o.data.calc_loop_triangles()
    pts=[(v.co.x,v.co.z,-v.co.y) for v in o.data.vertices]
    bounds={"min":[round(min(q[i] for q in pts),5) for i in range(3)],"max":[round(max(q[i] for q in pts),5) for i in range(3)]}
    manifest.append({"node":o.name,"bounds":bounds,"triangles":len(o.data.loop_triangles),
                     "vertices":len(o.data.vertices),"materials":[m.name for m in o.data.materials]})
bpy.ops.export_scene.gltf(filepath=str(PUBLIC/"library.glb"),export_format="GLB",use_selection=True,
    export_apply=True,export_yup=True,export_cameras=False,export_lights=False,export_extras=True,export_animations=False)
metadata={"schemaVersion":1,"generator":"tools/isometric/build_library.py","blenderVersion":bpy.app.version_string,
 "coordinateSystem":"glTF: +Y up, +Z forward, pivot at ground centre","parcelSize":1,
 "recolorMaterial":"company_accent","textures":0,"assetCount":len(assets),
 "totalTriangles":sum(a["triangles"] for a in manifest),
 "materialGroups":sum(len(a["materials"]) for a in manifest),
 "glbBytes":(PUBLIC/"library.glb").stat().st_size,
 "glbSha256":hashlib.sha256((PUBLIC/"library.glb").read_bytes()).hexdigest(),"assets":manifest}
(PUBLIC/"manifest.json").write_text(json.dumps(metadata,indent=2)+"\n",encoding="utf-8")

# Source and contact sheet: arranged collection of original mesh assets.
for i,o in enumerate(assets):
    col=i%5;row=i//5;o.location=((col-2)*1.05,row*1.10,0)
    bpy.ops.object.text_add(location=(o.location.x,o.location.y-.42,.014));text=bpy.context.object
    text.name="SOURCE_LABEL_"+o.name
    text.data.body=o.name.replace("asset_factory_","").replace("asset_site_","site ").replace("asset_","")
    text.data.align_x="CENTER";text.data.size=.043;text.data.materials.append(M["iron"])
box("SOURCE_STUDIO",(0,-.04,-2.0),(6,.08,5.7),"cream",.015);parts=[]
scene=bpy.context.scene;scene.render.engine="CYCLES";scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=2200;scene.render.resolution_y=1800;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new("Warm studio");scene.world.use_nodes=True
scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.73,.83,.89,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value=.6
bpy.ops.object.light_add(type="AREA",location=(-3,-4,8));key=bpy.context.object
key.name="SOURCE_KeyLight";key.data.energy=700;key.data.shape="DISK";key.data.size=6
bpy.ops.object.light_add(type="AREA",location=(4,3,5));fill=bpy.context.object
fill.name="SOURCE_FillLight";fill.data.energy=400;fill.data.size=5
target=Vector((0,1.6,.0));bpy.ops.object.camera_add(location=(5,-8,11));camera=bpy.context.object
camera.name="SOURCE_ContactCamera";camera.data.type="ORTHO";camera.data.ortho_scale=7.25
camera.rotation_euler=(target-camera.location).to_track_quat("-Z","Y").to_euler();scene.camera=camera
scene.view_settings.view_transform="AgX";scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(SOURCE/"contact-sheet.png")
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/"library.blend"),compress=True)
bpy.ops.render.render(write_still=True)
print("ISOMETRIC_KIT "+json.dumps({"assets":len(assets),"triangles":metadata["totalTriangles"],
 "glbBytes":(PUBLIC/"library.glb").stat().st_size,"blendBytes":(SOURCE/"library.blend").stat().st_size}))
