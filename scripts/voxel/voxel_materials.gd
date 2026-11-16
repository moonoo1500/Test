class_name VoxelMaterials
extends RefCounted
## Catalog of destructible voxel materials and shared procedural triplanar/UV shader.

enum Id {
	AIR = 0,
	BEDROCK = 1,
	CONCRETE = 2,
	BRICK = 3,
	WOOD = 4,
	STEEL = 5,
	GLASS = 6,
	RUBBLE = 7,
	FUEL = 8,
	BRIDGE = 9,
	CHARRED = 10,
	SNOW_PANEL = 11,
	ACCENT_AMBER = 12,
}

const DATA := {
	Id.AIR: {
		"name_key": "MAT_AIR",
		"color": Color(0.0, 0.0, 0.0, 0.0),
		"hp": 0.0,
		"blast_resist": 0.0,
		"flammable": false,
		"hammer_immune": false,
		"explosive_radius": 0.0,
		"sfx": "impact_stone",
	},
	Id.BEDROCK: {
		"name_key": "MAT_BEDROCK",
		"color": Color(0.18, 0.21, 0.25, 1.0),
		"hp": 99999.0,
		"blast_resist": 1.0,
		"flammable": false,
		"hammer_immune": true,
		"explosive_radius": 0.0,
		"sfx": "impact_metal",
	},
	Id.CONCRETE: {
		"name_key": "MAT_CONCRETE",
		"color": Color(0.52, 0.56, 0.60, 1.0),
		"hp": 44.0,
		"blast_resist": 0.42,
		"flammable": false,
		"hammer_immune": false,
		"explosive_radius": 0.0,
		"sfx": "impact_stone",
	},
	Id.BRICK: {
		"name_key": "MAT_BRICK",
		"color": Color(0.71, 0.35, 0.26, 1.0),
		"hp": 22.0,
		"blast_resist": 0.22,
		"flammable": false,
		"hammer_immune": false,
		"explosive_radius": 0.0,
		"sfx": "impact_stone",
	},
	Id.WOOD: {
		"name_key": "MAT_WOOD",
		"color": Color(0.62, 0.44, 0.27, 1.0),
		"hp": 14.0,
		"blast_resist": 0.14,
		"flammable": true,
		"hammer_immune": false,
		"explosive_radius": 0.0,
		"sfx": "impact_wood",
	},
	Id.STEEL: {
		"name_key": "MAT_STEEL",
		"color": Color(0.30, 0.40, 0.50, 1.0),
		"hp": 140.0,
		"blast_resist": 0.78,
		"flammable": false,
		"hammer_immune": true,
		"explosive_radius": 0.0,
		"sfx": "impact_metal",
	},
	Id.GLASS: {
		"name_key": "MAT_GLASS",
		"color": Color(0.56, 0.84, 0.94, 1.0),
		"hp": 4.0,
		"blast_resist": 0.05,
		"flammable": false,
		"hammer_immune": false,
		"explosive_radius": 0.0,
		"sfx": "impact_glass",
	},
	Id.RUBBLE: {
		"name_key": "MAT_RUBBLE",
		"color": Color(0.60, 0.42, 0.28, 1.0),
		"hp": 30.0,
		"blast_resist": 0.30,
		"flammable": false,
		"hammer_immune": false,
		"explosive_radius": 0.0,
		"sfx": "impact_stone",
	},
	Id.FUEL: {
		"name_key": "MAT_FUEL",
		"color": Color(0.84, 0.22, 0.18, 1.0),
		"hp": 10.0,
		"blast_resist": 0.10,
		"flammable": true,
		"hammer_immune": false,
		"explosive_radius": 3.4,
		"sfx": "impact_metal",
	},
	Id.BRIDGE: {
		"name_key": "MAT_BRIDGE",
		"color": Color(0.24, 0.68, 0.48, 1.0),
		"hp": 36.0,
		"blast_resist": 0.50,
		"flammable": false,
		"hammer_immune": false,
		"explosive_radius": 0.0,
		"sfx": "impact_wood",
	},
	Id.CHARRED: {
		"name_key": "MAT_CHARRED",
		"color": Color(0.16, 0.14, 0.14, 1.0),
		"hp": 6.0,
		"blast_resist": 0.08,
		"flammable": false,
		"hammer_immune": false,
		"explosive_radius": 0.0,
		"sfx": "impact_wood",
	},
	Id.SNOW_PANEL: {
		"name_key": "MAT_CONCRETE",
		"color": Color(0.80, 0.86, 0.91, 1.0),
		"hp": 26.0,
		"blast_resist": 0.26,
		"flammable": false,
		"hammer_immune": false,
		"explosive_radius": 0.0,
		"sfx": "impact_stone",
	},
	Id.ACCENT_AMBER: {
		"name_key": "MAT_STEEL",
		"color": Color(0.90, 0.58, 0.16, 1.0),
		"hp": 28.0,
		"blast_resist": 0.35,
		"flammable": false,
		"hammer_immune": false,
		"explosive_radius": 0.0,
		"sfx": "impact_metal",
	},
}

const VOXEL_SHADER_CODE := """
shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;

varying float v_mat_id;

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

void vertex() {
	v_mat_id = floor(UV2.x + 0.5);
}

void fragment() {
	vec2 vuv = UV;
	vec2 cell = floor(vuv);
	vec2 f = fract(vuv);
	float cell_noise = (hash21(cell) - 0.5) * 0.08;
	vec3 base = COLOR.rgb;
	float rough = 0.82;
	float metal = 0.05;
	vec3 emit = vec3(0.0);

	// Crisp voxel edge bevel darkening
	float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
	float bevel = smoothstep(0.0, 0.06, edge);
	float shade = 0.92 + 0.08 * bevel + cell_noise;

	int mid = int(v_mat_id);
	if (mid == 3) {
		// Brick mortar pattern
		float row = floor(vuv.y * 2.0);
		vec2 bf = vec2(fract(vuv.x + row * 0.5), fract(vuv.y * 2.0));
		float mortar = step(0.07, bf.x) * step(0.11, bf.y);
		shade *= mix(0.72, 1.05, mortar);
		rough = 0.88;
	} else if (mid == 4 || mid == 9) {
		// Wood / composite plank streaks
		float plank = fract(vuv.y * 2.0);
		float seam = step(0.08, plank);
		shade *= mix(0.78, 1.03, seam);
		rough = 0.78;
	} else if (mid == 5 || mid == 12) {
		// Steel / caution trim
		float frame = step(0.07, edge);
		shade *= mix(0.80, 1.04, frame);
		rough = 0.42;
		metal = 0.55;
	} else if (mid == 6) {
		// Glass sheen
		rough = 0.14;
		metal = 0.25;
		emit = vec3(0.04, 0.09, 0.12);
	} else if (mid == 8) {
		// Fuel hazard diagonal stripes
		float stripe = step(0.5, fract((vuv.x + vuv.y) * 1.5));
		base = mix(base, vec3(0.95, 0.65, 0.12), stripe * 0.45);
		rough = 0.48;
		metal = 0.35;
		emit = vec3(0.10, 0.02, 0.01);
	}

	ALBEDO = clamp(base * shade, vec3(0.0), vec3(1.0));
	ROUGHNESS = rough;
	METALLIC = metal;
	EMISSION = emit;
}
"""


static func get_color(mat_id: int) -> Color:
	var d: Dictionary = DATA.get(mat_id, DATA[Id.CONCRETE])
	return d["color"]


static func get_hp(mat_id: int) -> float:
	var d: Dictionary = DATA.get(mat_id, DATA[Id.CONCRETE])
	return float(d["hp"])


static func get_blast_resist(mat_id: int) -> float:
	var d: Dictionary = DATA.get(mat_id, DATA[Id.CONCRETE])
	return float(d["blast_resist"])


static func is_flammable(mat_id: int) -> bool:
	var d: Dictionary = DATA.get(mat_id, DATA[Id.CONCRETE])
	return bool(d["flammable"])


static func is_hammer_immune(mat_id: int) -> bool:
	var d: Dictionary = DATA.get(mat_id, DATA[Id.CONCRETE])
	return bool(d["hammer_immune"])


static func is_indestructible(mat_id: int) -> bool:
	return mat_id == Id.BEDROCK


static func get_explosive_radius(mat_id: int) -> float:
	var d: Dictionary = DATA.get(mat_id, DATA[Id.CONCRETE])
	return float(d["explosive_radius"])


static func get_impact_sfx(mat_id: int) -> String:
	var d: Dictionary = DATA.get(mat_id, DATA[Id.CONCRETE])
	return str(d["sfx"])


static func create_voxel_shader_material() -> ShaderMaterial:
	var shader := Shader.new()
	shader.code = VOXEL_SHADER_CODE
	var mat := ShaderMaterial.new()
	mat.shader = shader
	return mat
