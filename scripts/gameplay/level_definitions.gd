class_name LevelDefinitions
extends RefCounted
## Catalog of original locations, campaign missions, tutorial, and sandbox presets.

const LOCATIONS := {
	"training_yard": {
		"id": "training_yard",
		"name_key": "LOC_TRAINING_NAME",
		"desc_key": "LOC_TRAINING_DESC",
		"sky_top": Color(0.20, 0.42, 0.68),
		"sky_horizon": Color(0.62, 0.76, 0.88),
		"sun_color": Color(1.0, 0.96, 0.88),
		"sun_energy": 1.15,
		"ambient_color": Color(0.36, 0.42, 0.50),
		"fog_enabled": false,
		"fog_color": Color(0.62, 0.74, 0.84),
	},
	"dock": {
		"id": "dock",
		"name_key": "LOC_DOCK_NAME",
		"desc_key": "LOC_DOCK_DESC",
		"sky_top": Color(0.16, 0.30, 0.48),
		"sky_horizon": Color(0.55, 0.67, 0.78),
		"sun_color": Color(0.98, 0.92, 0.82),
		"sun_energy": 1.1,
		"ambient_color": Color(0.32, 0.38, 0.46),
		"fog_enabled": true,
		"fog_color": Color(0.54, 0.65, 0.76),
	},
	"quarry": {
		"id": "quarry",
		"name_key": "LOC_QUARRY_NAME",
		"desc_key": "LOC_QUARRY_DESC",
		"sky_top": Color(0.34, 0.46, 0.64),
		"sky_horizon": Color(0.84, 0.68, 0.52),
		"sun_color": Color(1.0, 0.88, 0.72),
		"sun_energy": 1.25,
		"ambient_color": Color(0.44, 0.38, 0.34),
		"fog_enabled": true,
		"fog_color": Color(0.76, 0.64, 0.52),
	},
	"cryo": {
		"id": "cryo",
		"name_key": "LOC_CRYO_NAME",
		"desc_key": "LOC_CRYO_DESC",
		"sky_top": Color(0.10, 0.22, 0.38),
		"sky_horizon": Color(0.45, 0.64, 0.78),
		"sun_color": Color(0.86, 0.94, 1.0),
		"sun_energy": 1.05,
		"ambient_color": Color(0.34, 0.44, 0.54),
		"fog_enabled": true,
		"fog_color": Color(0.52, 0.68, 0.80),
	},
}

const CAMPAIGN_MISSIONS := [
	{
		"id": "mission_1_dock",
		"location_id": "dock",
		"title_key": "MISSION_1_TITLE",
		"brief_key": "MISSION_1_BRIEF",
		"alarm_seconds": 45.0,
		"alarm_trigger_at": 3,
		"par_time": 110.0,
		"charges": 8,
		"bridges": 14,
	},
	{
		"id": "mission_2_mooring",
		"location_id": "dock",
		"title_key": "MISSION_2_TITLE",
		"brief_key": "MISSION_2_BRIEF",
		"alarm_seconds": 55.0,
		"alarm_trigger_at": 1,
		"par_time": 130.0,
		"charges": 8,
		"bridges": 16,
	},
	{
		"id": "mission_3_quarry",
		"location_id": "quarry",
		"title_key": "MISSION_3_TITLE",
		"brief_key": "MISSION_3_BRIEF",
		"alarm_seconds": 65.0,
		"alarm_trigger_at": 1,
		"par_time": 145.0,
		"charges": 10,
		"bridges": 16,
	},
	{
		"id": "mission_4_cryo",
		"location_id": "cryo",
		"title_key": "MISSION_4_TITLE",
		"brief_key": "MISSION_4_BRIEF",
		"alarm_seconds": 75.0,
		"alarm_trigger_at": 1,
		"par_time": 170.0,
		"charges": 10,
		"bridges": 22,
	},
]

const SANDBOX_LOCATIONS := ["dock", "quarry", "cryo", "training_yard"]


static func get_mission_config(mission_id: String) -> Dictionary:
	if mission_id == "tutorial":
		return {
			"id": "tutorial",
			"location_id": "training_yard",
			"title_key": "MISSION_TUTORIAL_TITLE",
			"brief_key": "MISSION_TUTORIAL_BRIEF",
			"alarm_seconds": 0.0,
			"alarm_trigger_at": 999,
			"par_time": 240.0,
			"charges": 99,
			"bridges": 99,
		}
	for m in CAMPAIGN_MISSIONS:
		if m["id"] == mission_id:
			return m
	return CAMPAIGN_MISSIONS[0]


static func get_next_mission_id(mission_id: String) -> String:
	for i in range(CAMPAIGN_MISSIONS.size()):
		if CAMPAIGN_MISSIONS[i]["id"] == mission_id and i + 1 < CAMPAIGN_MISSIONS.size():
			return CAMPAIGN_MISSIONS[i + 1]["id"]
	return ""


static func get_location_config(location_id: String) -> Dictionary:
	return LOCATIONS.get(location_id, LOCATIONS["dock"])
