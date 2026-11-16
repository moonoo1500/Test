class_name LevelBuilder
extends RefCounted
## Deterministic procedural voxel + prop + vehicle layout builders for all arenas.

const VS := VoxelMesher.VOXEL_SIZE


static func build_level(
	world: VoxelWorld,
	entity_root: Node3D,
	location_id: String,
	mission_id: String,
	spawn_entities: bool = true
) -> Dictionary:
	world.clear_world()
	var result := {}
	match location_id:
		"training_yard":
			result = _build_training_yard(world, entity_root, spawn_entities)
		"quarry":
			result = _build_quarry(world, entity_root, spawn_entities)
		"cryo":
			result = _build_cryo(world, entity_root, spawn_entities)
		_:
			result = _build_dock(world, entity_root, mission_id, spawn_entities)

	world.rebuild_dirty_sync()
	return result


static func _build_hollow_room(
	world: VoxelWorld,
	min_c: Vector3i,
	max_c: Vector3i,
	wall_mat: int,
	roof_mat: int,
	floor_mat: int = 0
) -> void:
	for y in range(min_c.y, max_c.y + 1):
		for z in range(min_c.z, max_c.z + 1):
			for x in range(min_c.x, max_c.x + 1):
				if y == min_c.y and floor_mat != 0:
					world.set_voxel(Vector3i(x, y, z), floor_mat)
				elif y == max_c.y and roof_mat != 0:
					world.set_voxel(Vector3i(x, y, z), roof_mat)
				elif x == min_c.x or x == max_c.x or z == min_c.z or z == max_c.z:
					world.set_voxel(Vector3i(x, y, z), wall_mat)


static func _carve_door(world: VoxelWorld, cx: int, y0: int, cz: int, along_x: bool) -> void:
	for dy in range(5):
		for d in range(-1, 2):
			var p := Vector3i(cx + d, y0 + dy, cz) if along_x else Vector3i(cx, y0 + dy, cz + d)
			world.set_voxel(p, 0)


static func _spawn_prop(
	world: VoxelWorld,
	entity_root: Node3D,
	kind: PhysicsProp.Kind,
	world_pos: Vector3,
	obj_id: String = ""
) -> PhysicsProp:
	var p := PhysicsProp.new()
	p.position = world_pos
	entity_root.add_child(p)
	p.setup(kind, world, obj_id)
	return p


static func _spawn_vehicle(
	world: VoxelWorld,
	entity_root: Node3D,
	kind: VehicleController.Kind,
	world_pos: Vector3,
	yaw_deg: float = 0.0
) -> VehicleController:
	var v := VehicleController.new()
	v.position = world_pos
	v.rotation.y = deg_to_rad(yaw_deg)
	entity_root.add_child(v)
	v.setup(kind, world)
	return v


static func _build_training_yard(
	world: VoxelWorld,
	entity_root: Node3D,
	spawn_entities: bool
) -> Dictionary:
	# Ground deck x=0..84, z=0..36, y=0..1 BEDROCK + trench pit at x=50..57
	world.fill_box(Vector3i(0, 0, 0), Vector3i(49, 1, 36), VoxelMaterials.Id.BEDROCK)
	world.fill_box(Vector3i(50, 0, 0), Vector3i(57, 0, 36), VoxelMaterials.Id.BEDROCK) # Deep trench floor
	world.fill_box(Vector3i(58, 0, 0), Vector3i(86, 1, 36), VoxelMaterials.Id.BEDROCK)

	# Perimeter fence
	world.fill_box(Vector3i(0, 2, 0), Vector3i(86, 5, 0), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(0, 2, 36), Vector3i(86, 5, 36), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(0, 2, 0), Vector3i(0, 5, 36), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(86, 2, 0), Vector3i(86, 5, 36), VoxelMaterials.Id.CONCRETE)

	# Station 2 (x=18): Brick barrier wall across lane (with glass viewing window)
	world.fill_box(Vector3i(18, 2, 1), Vector3i(19, 8, 35), VoxelMaterials.Id.BRICK)
	world.fill_box(Vector3i(18, 4, 15), Vector3i(19, 6, 20), VoxelMaterials.Id.GLASS)

	# Station 3 (x=28): Steel gate inside concrete frame
	world.fill_box(Vector3i(28, 2, 1), Vector3i(29, 9, 14), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(28, 2, 22), Vector3i(29, 9, 35), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(28, 7, 15), Vector3i(29, 9, 21), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(28, 2, 15), Vector3i(28, 6, 21), VoxelMaterials.Id.STEEL)

	# Station 4 (x=37): Concrete overhang supported by 2 pillars (for seismic charge collapse)
	world.fill_box(Vector3i(37, 2, 13), Vector3i(38, 6, 14), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(37, 2, 22), Vector3i(38, 6, 23), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(36, 7, 12), Vector3i(40, 8, 24), VoxelMaterials.Id.BRICK)

	# Station 5 (x=44): Flammable wood stack (pre-ignited)
	world.fill_box(Vector3i(43, 2, 14), Vector3i(46, 5, 22), VoxelMaterials.Id.WOOD)
	if world.fire_sim != null:
		world.fire_sim.ignite_cell(Vector3i(44, 3, 18), world, 120.0)
		world.fire_sim.ignite_cell(Vector3i(45, 3, 17), world, 120.0)

	# Ramp out of trench just in case player falls
	for i in range(4):
		world.fill_box(Vector3i(54 + i, 1, 3), Vector3i(54 + i, 1, 6), VoxelMaterials.Id.CONCRETE)

	var objectives: Array[PhysicsProp] = []
	var vehicles: Array[VehicleController] = []
	if spawn_entities:
		_spawn_prop(world, entity_root, PhysicsProp.Kind.CRATE, Vector3(6.5, 1.5, 6.0))
		_spawn_prop(world, entity_root, PhysicsProp.Kind.FUEL_BARREL, Vector3(17.2, 1.6, 10.5))
		var v := _spawn_vehicle(world, entity_root, VehicleController.Kind.LOADER, Vector3(32.5, 1.4, 9.0), -90.0)
		vehicles.append(v)
		var core := _spawn_prop(
			world,
			entity_root,
			PhysicsProp.Kind.OBJECTIVE_CORE,
			Vector3(36.0, 1.6, 9.0),
			"tut_core"
		)
		objectives.append(core)

	return {
		"player_spawn": Vector3(3.5, 1.4, 9.0),
		"player_yaw": -PI * 0.5,
		"evac_pos": Vector3(40.5, 1.2, 9.0),
		"objectives": objectives,
		"vehicles": vehicles,
		"tutorial_markers": {
			"step1": Vector3(7.0, 1.2, 9.0),
		},
	}


static func _build_dock(
	world: VoxelWorld,
	entity_root: Node3D,
	mission_id: String,
	spawn_entities: bool
) -> Dictionary:
	# Coastal industrial dock: main concrete apron z=0..56, recessed harbor canal z=57..84
	world.fill_box(Vector3i(0, 0, 0), Vector3i(102, 1, 56), VoxelMaterials.Id.BEDROCK)
	world.fill_box(Vector3i(0, 0, 57), Vector3i(102, 0, 86), VoxelMaterials.Id.BEDROCK) # Water basin floor
	# Timber pier & barge on far side z=72..86
	world.fill_box(Vector3i(16, 1, 57), Vector3i(24, 2, 74), VoxelMaterials.Id.WOOD)
	world.fill_box(Vector3i(72, 1, 68), Vector3i(96, 2, 84), VoxelMaterials.Id.STEEL)
	world.fill_box(Vector3i(74, 3, 70), Vector3i(94, 3, 82), VoxelMaterials.Id.ACCENT_AMBER)

	# Perimeter dock walls
	world.fill_box(Vector3i(0, 2, 0), Vector3i(102, 6, 0), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(0, 2, 0), Vector3i(0, 6, 86), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(102, 2, 0), Vector3i(102, 6, 86), VoxelMaterials.Id.CONCRETE)

	# Building 1: Brick Gatehouse (x=14..32, z=12..30)
	_build_hollow_room(world, Vector3i(14, 2, 12), Vector3i(32, 9, 30), VoxelMaterials.Id.BRICK, VoxelMaterials.Id.WOOD)
	_carve_door(world, 23, 2, 12, true)
	world.fill_box(Vector3i(18, 9, 17), Vector3i(28, 9, 25), VoxelMaterials.Id.GLASS) # Skylight

	# Building 2: Main Cargo Warehouse (x=42..72, z=14..44, two floors!)
	_build_hollow_room(
		world,
		Vector3i(42, 2, 14),
		Vector3i(72, 10, 44),
		VoxelMaterials.Id.CONCRETE,
		VoxelMaterials.Id.CONCRETE
	)
	# Internal brick wall & 2nd floor wood loft
	world.fill_box(Vector3i(57, 2, 15), Vector3i(57, 9, 43), VoxelMaterials.Id.BRICK)
	world.fill_box(Vector3i(43, 10, 15), Vector3i(71, 10, 43), VoxelMaterials.Id.WOOD)
	# Upper roof control room
	_build_hollow_room(
		world,
		Vector3i(46, 11, 20),
		Vector3i(64, 16, 36),
		VoxelMaterials.Id.BRICK,
		VoxelMaterials.Id.STEEL
	)
	world.fill_box(Vector3i(46, 13, 24), Vector3i(46, 15, 32), VoxelMaterials.Id.GLASS)
	# Exterior wood staircase to roof on x=41
	for s in range(9):
		world.fill_box(Vector3i(40, 2 + s, 18 + s * 2), Vector3i(41, 2 + s, 19 + s * 2), VoxelMaterials.Id.WOOD)
	# Steel vault shutter on south face
	_carve_door(world, 50, 2, 14, true)
	world.fill_box(Vector3i(49, 2, 14), Vector3i(51, 6, 14), VoxelMaterials.Id.STEEL)

	# Building 3: Crane Gantry & Suspended Container over canal (x=76..92, z=36..68)
	# 4 concrete crane legs anchored on shore + steel container supported by 2 cuttable steel struts
	world.fill_box(Vector3i(76, 2, 36), Vector3i(78, 16, 38), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(90, 2, 36), Vector3i(92, 16, 38), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(76, 16, 36), Vector3i(92, 17, 38), VoxelMaterials.Id.STEEL)
	# Suspended orange/amber shipping container extending toward canal (held by 2 steel struts at z=46)
	world.fill_box(Vector3i(80, 2, 46), Vector3i(81, 8, 47), VoxelMaterials.Id.STEEL)
	world.fill_box(Vector3i(87, 2, 46), Vector3i(88, 8, 47), VoxelMaterials.Id.STEEL)
	world.fill_box(Vector3i(79, 9, 44), Vector3i(89, 13, 66), VoxelMaterials.Id.ACCENT_AMBER)

	# Fuel depot barrels cluster near warehouse east wall
	world.fill_box(Vector3i(73, 2, 22), Vector3i(74, 4, 24), VoxelMaterials.Id.FUEL)

	var objectives: Array[PhysicsProp] = []
	var vehicles: Array[VehicleController] = []
	if spawn_entities:
		vehicles.append(
			_spawn_vehicle(world, entity_root, VehicleController.Kind.LOADER, Vector3(14.5, 1.4, 21.0), -90.0)
		)
		_spawn_prop(world, entity_root, PhysicsProp.Kind.FUEL_BARREL, Vector3(21.5, 1.6, 11.5))
		_spawn_prop(world, entity_root, PhysicsProp.Kind.FUEL_BARREL, Vector3(36.0, 1.6, 15.0))
		_spawn_prop(world, entity_root, PhysicsProp.Kind.CRATE, Vector3(18.0, 1.6, 10.0))
		_spawn_prop(world, entity_root, PhysicsProp.Kind.STEEL_WEIGHT, Vector3(25.0, 1.6, 23.0))

		if mission_id == "mission_2_mooring":
			objectives.append(
				_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(11.5, 1.8, 10.5), "m2_1")
			)
			objectives.append(
				_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(31.5, 1.8, 18.0), "m2_2")
			)
			objectives.append(
				_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(27.5, 6.2, 14.0), "m2_3")
			)
			objectives.append(
				_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(42.0, 7.2, 26.0), "m2_4")
			)
		else:
			objectives.append(
				_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(11.5, 1.8, 10.5), "m1_1")
			)
			objectives.append(
				_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(32.0, 1.8, 16.0), "m1_2")
			)
			objectives.append(
				_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(27.5, 6.2, 14.0), "m1_3")
			)

	return {
		"player_spawn": Vector3(6.0, 1.4, 4.5),
		"player_yaw": -PI * 0.65,
		"evac_pos": Vector3(42.0, 2.3, 38.0),
		"objectives": objectives,
		"vehicles": vehicles,
	}


static func _build_quarry(
	world: VoxelWorld,
	entity_root: Node3D,
	spawn_entities: bool
) -> Dictionary:
	# Canyon quarry floor + terraced basalt ridges
	world.fill_box(Vector3i(0, 0, 0), Vector3i(108, 1, 90), VoxelMaterials.Id.BEDROCK)
	# Canyon perimeter cliffs
	world.fill_box(Vector3i(0, 2, 0), Vector3i(108, 10, 2), VoxelMaterials.Id.RUBBLE)
	world.fill_box(Vector3i(0, 2, 88), Vector3i(108, 10, 90), VoxelMaterials.Id.RUBBLE)
	world.fill_box(Vector3i(0, 2, 0), Vector3i(2, 10, 90), VoxelMaterials.Id.RUBBLE)
	world.fill_box(Vector3i(106, 2, 0), Vector3i(108, 10, 90), VoxelMaterials.Id.RUBBLE)

	# Upper plateau on east side (x=76..104, z=10..80, y=2..8)
	world.fill_box(Vector3i(76, 2, 10), Vector3i(104, 8, 80), VoxelMaterials.Id.RUBBLE)
	# Carved haul ramp up plateau at z=12..22
	for s in range(14):
		world.fill_box(Vector3i(62 + s, 2, 12), Vector3i(62 + s, 2 + int(s / 2), 20), VoxelMaterials.Id.CONCRETE)

	# Rockfall barricade blocking center haul road (x=42..46, z=24..54)
	world.fill_box(Vector3i(42, 2, 24), Vector3i(46, 6, 54), VoxelMaterials.Id.RUBBLE)

	# Multi-span Timber Viaduct crossing central canyon (x=22..74, z=48..58, deck at y=10)
	for px in [24, 40, 56, 72]:
		world.fill_box(Vector3i(px, 2, 49), Vector3i(px + 2, 9, 51), VoxelMaterials.Id.WOOD)
		world.fill_box(Vector3i(px, 2, 55), Vector3i(px + 2, 9, 57), VoxelMaterials.Id.WOOD)
	world.fill_box(Vector3i(22, 10, 48), Vector3i(75, 11, 58), VoxelMaterials.Id.WOOD)
	# Steel crusher hopper perched atop viaduct
	world.fill_box(Vector3i(36, 12, 49), Vector3i(46, 17, 57), VoxelMaterials.Id.STEEL)

	# Blasting Shack (x=14..28, z=14..28)
	_build_hollow_room(world, Vector3i(14, 2, 14), Vector3i(28, 8, 28), VoxelMaterials.Id.BRICK, VoxelMaterials.Id.WOOD)
	_carve_door(world, 21, 2, 14, true)

	# Crusher Tower (x=54..70, z=66..82)
	_build_hollow_room(
		world,
		Vector3i(54, 2, 66),
		Vector3i(70, 14, 82),
		VoxelMaterials.Id.CONCRETE,
		VoxelMaterials.Id.STEEL
	)
	_carve_door(world, 54, 2, 74, false)
	world.fill_box(Vector3i(58, 8, 66), Vector3i(66, 11, 66), VoxelMaterials.Id.GLASS)

	var objectives: Array[PhysicsProp] = []
	var vehicles: Array[VehicleController] = []
	if spawn_entities:
		vehicles.append(
			_spawn_vehicle(world, entity_root, VehicleController.Kind.CRAWLER, Vector3(13.0, 1.4, 21.0), -90.0)
		)
		_spawn_prop(world, entity_root, PhysicsProp.Kind.FUEL_BARREL, Vector3(20.5, 1.6, 20.0))
		_spawn_prop(world, entity_root, PhysicsProp.Kind.FUEL_BARREL, Vector3(24.0, 1.6, 27.0))
		_spawn_prop(world, entity_root, PhysicsProp.Kind.CRATE, Vector3(16.0, 1.6, 14.0))

		objectives.append(
			_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(10.5, 1.8, 10.5), "m3_1")
		)
		objectives.append(
			_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(27.0, 1.8, 22.0), "m3_2")
		)
		objectives.append(
			_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(31.0, 1.8, 37.0), "m3_3")
		)
		objectives.append(
			_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(44.0, 5.2, 30.0), "m3_4")
		)

	return {
		"player_spawn": Vector3(6.5, 1.4, 6.5),
		"player_yaw": -PI * 0.65,
		"evac_pos": Vector3(45.0, 4.8, 16.0),
		"objectives": objectives,
		"vehicles": vehicles,
	}


static func _build_cryo(
	world: VoxelWorld,
	entity_root: Node3D,
	spawn_entities: bool
) -> Dictionary:
	# Arctic station plateau
	world.fill_box(Vector3i(0, 0, 0), Vector3i(108, 1, 90), VoxelMaterials.Id.BEDROCK)
	world.fill_box(Vector3i(0, 2, 0), Vector3i(108, 5, 1), VoxelMaterials.Id.SNOW_PANEL)
	world.fill_box(Vector3i(0, 2, 89), Vector3i(108, 5, 90), VoxelMaterials.Id.SNOW_PANEL)
	world.fill_box(Vector3i(0, 2, 0), Vector3i(1, 5, 90), VoxelMaterials.Id.SNOW_PANEL)
	world.fill_box(Vector3i(107, 2, 0), Vector3i(108, 5, 90), VoxelMaterials.Id.SNOW_PANEL)

	# Central Glass Atrium (x=18..42, z=18..42)
	_build_hollow_room(
		world,
		Vector3i(18, 2, 18),
		Vector3i(42, 10, 42),
		VoxelMaterials.Id.SNOW_PANEL,
		VoxelMaterials.Id.GLASS
	)
	world.fill_box(Vector3i(24, 4, 18), Vector3i(36, 8, 18), VoxelMaterials.Id.GLASS)
	_carve_door(world, 18, 2, 30, false)

	# West Lab Tower (x=20..38, z=56..76, 2 stories)
	_build_hollow_room(
		world,
		Vector3i(20, 2, 56),
		Vector3i(38, 16, 76),
		VoxelMaterials.Id.SNOW_PANEL,
		VoxelMaterials.Id.CONCRETE
	)
	world.fill_box(Vector3i(21, 9, 57), Vector3i(37, 9, 75), VoxelMaterials.Id.CONCRETE)
	_carve_door(world, 29, 2, 56, true)
	world.fill_box(Vector3i(28, 2, 56), Vector3i(30, 6, 56), VoxelMaterials.Id.STEEL)
	# Internal staircase to upper lab
	for s in range(8):
		world.fill_box(Vector3i(22 + s, 2 + s, 72), Vector3i(23 + s, 2 + s, 74), VoxelMaterials.Id.STEEL)

	# East Lab Tower (x=68..88, z=56..76, 2 stories)
	_build_hollow_room(
		world,
		Vector3i(68, 2, 56),
		Vector3i(88, 16, 76),
		VoxelMaterials.Id.SNOW_PANEL,
		VoxelMaterials.Id.STEEL
	)
	world.fill_box(Vector3i(69, 9, 57), Vector3i(87, 9, 75), VoxelMaterials.Id.CONCRETE)
	_carve_door(world, 78, 2, 56, true)

	# Collapsed Skybridge between West (x=38) and East (x=68) at y=10, z=62..68 (gap x=46..60!)
	world.fill_box(Vector3i(38, 10, 62), Vector3i(46, 11, 68), VoxelMaterials.Id.STEEL)
	world.fill_box(Vector3i(60, 10, 62), Vector3i(68, 11, 68), VoxelMaterials.Id.STEEL)

	# Server Wing with burning timber cable trays (x=64..90, z=16..38)
	_build_hollow_room(
		world,
		Vector3i(64, 2, 16),
		Vector3i(90, 9, 38),
		VoxelMaterials.Id.BRICK,
		VoxelMaterials.Id.SNOW_PANEL
	)
	_carve_door(world, 64, 2, 27, false)
	world.fill_box(Vector3i(72, 2, 22), Vector3i(82, 5, 30), VoxelMaterials.Id.WOOD)
	if world.fire_sim != null:
		world.fire_sim.ignite_cell(Vector3i(74, 3, 25), world, 160.0)
		world.fire_sim.ignite_cell(Vector3i(77, 4, 27), world, 160.0)

	# Helipad on North East (x=82..100, z=78..88)
	world.fill_box(Vector3i(82, 2, 78), Vector3i(100, 3, 88), VoxelMaterials.Id.CONCRETE)
	world.fill_box(Vector3i(88, 3, 81), Vector3i(94, 3, 85), VoxelMaterials.Id.ACCENT_AMBER)

	var objectives: Array[PhysicsProp] = []
	var vehicles: Array[VehicleController] = []
	if spawn_entities:
		vehicles.append(
			_spawn_vehicle(world, entity_root, VehicleController.Kind.CRAWLER, Vector3(26.0, 1.4, 23.0), 0.0)
		)
		vehicles.append(
			_spawn_vehicle(world, entity_root, VehicleController.Kind.LOADER, Vector3(8.5, 1.4, 15.0), -90.0)
		)
		_spawn_prop(world, entity_root, PhysicsProp.Kind.FUEL_BARREL, Vector3(32.5, 1.6, 13.0))

		objectives.append(
			_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(15.0, 1.8, 15.0), "m4_1")
		)
		objectives.append(
			_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(41.0, 1.8, 13.5), "m4_2")
		)
		objectives.append(
			_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(14.5, 5.8, 33.0), "m4_3")
		)
		objectives.append(
			_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(39.0, 5.8, 33.0), "m4_4")
		)
		objectives.append(
			_spawn_prop(world, entity_root, PhysicsProp.Kind.OBJECTIVE_CORE, Vector3(39.0, 1.8, 33.0), "m4_5")
		)

	return {
		"player_spawn": Vector3(6.0, 1.4, 8.0),
		"player_yaw": -PI * 0.5,
		"evac_pos": Vector3(45.5, 2.3, 41.5),
		"objectives": objectives,
		"vehicles": vehicles,
	}
