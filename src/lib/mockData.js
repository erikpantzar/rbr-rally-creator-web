// Static catalog data for the in-browser mock service (see mockService.js).
// All of it is copied verbatim from rbr-rally-creator-service's discovery
// data (discovery/capabilities/*.json + src/lib/rallyOptions.js), so the
// shapes match exactly what the real endpoints return -- stages/cars are a
// small representative sample (mixed surfaces, countries, and
// variable-surface/wetness/rain support), car groups and rally options are
// the full real lists.
export const MOCK_STAGES = [
  {
    "id": 376,
    "name": "Dolmen",
    "country": "Argentina",
    "length": "13.4 km",
    "defTime": "9:02.000",
    "surface": "gravel",
    "author": "Casgra11",
    "supportsVariableSurface": true,
    "supportsVariableWetness": true,
    "supportsVariableRain": true,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Morning Clear Crisp",
      "Morning HeavyCloud Hazy",
      "Morning HeavyCloud HeavyRain"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/376.jpg"
  },
  {
    "id": 34,
    "name": "East-West",
    "country": "Australia",
    "length": "9.5 km",
    "defTime": "7:02.000",
    "surface": "gravel",
    "author": "Warthog Games",
    "supportsVariableSurface": true,
    "supportsVariableWetness": false,
    "supportsVariableRain": false,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Evening Clear Crisp",
      "Evening PartCloud Crisp",
      "Evening Clear Hazy",
      "Evening PartCloud Hazy"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/34.jpg"
  },
  {
    "id": 473,
    "name": "Estrada da Banana - Downhill",
    "country": "Brazil",
    "length": "4.4 km",
    "defTime": "3:46.000",
    "surface": "gravel",
    "author": "Nereu Rocha",
    "supportsVariableSurface": true,
    "supportsVariableWetness": true,
    "supportsVariableRain": true,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Morning PartCloud LightFog"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/473.jpg"
  },
  {
    "id": 435,
    "name": "Rally Diepflingen 2022",
    "country": "Switzerland",
    "length": "5.3 km",
    "defTime": "4:31.000",
    "surface": "gravel",
    "author": "Prekek",
    "supportsVariableSurface": false,
    "supportsVariableWetness": true,
    "supportsVariableRain": true,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Morning Clear Crisp",
      "Morning HeavyCloud Hazy",
      "Morning LightCloud LightRain",
      "Morning HeavyCloud HeavyRain"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/435.jpg"
  },
  {
    "id": 517,
    "name": "Bayanbulak-Pegasus 2",
    "country": "China",
    "length": "18.1 km",
    "defTime": "15:29.000",
    "surface": "gravel",
    "author": "Simrally CN Team",
    "supportsVariableSurface": true,
    "supportsVariableWetness": true,
    "supportsVariableRain": true,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Noon Clear Crisp",
      "Noon HeavyCloud HeavyRain",
      "Noon LightCloud LightFog",
      "Noon HeavyCloud HeavyFog"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/517.jpg"
  },
  {
    "id": 389,
    "name": "Mitterbach",
    "country": "Austria",
    "length": "3.0 km",
    "defTime": "2:20.000",
    "surface": "snow",
    "author": "Myra43",
    "supportsVariableSurface": true,
    "supportsVariableWetness": false,
    "supportsVariableRain": true,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Noon PartCloud Hazy",
      "Noon HeavyCloud LightSnow",
      "Noon HeavyCloud HeavySnow"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/389.jpg"
  },
  {
    "id": 261,
    "name": "East-West II Snow",
    "country": "Australia",
    "length": "9.6 km",
    "defTime": "7:47.000",
    "surface": "snow",
    "author": "Warthog Games",
    "supportsVariableSurface": true,
    "supportsVariableWetness": false,
    "supportsVariableRain": false,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Morning Clear Crisp",
      "Morning PartCloud Crisp",
      "Morning Clear Hazy",
      "Morning PartCloud Hazy"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/261.jpg"
  },
  {
    "id": 437,
    "name": "Barak snow",
    "country": "Czech Republic",
    "length": "3.8 km",
    "defTime": "3:17.000",
    "surface": "snow",
    "author": "Miro Kurek",
    "supportsVariableSurface": true,
    "supportsVariableWetness": false,
    "supportsVariableRain": true,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Morning LightCloud NoSnow",
      "Morning HeavyCloud LightSnow",
      "Noon HeavyCloud HeavySnow"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/437.jpg"
  },
  {
    "id": 521,
    "name": "Ahvenus I",
    "country": "Finland",
    "length": "5.2 km",
    "defTime": "4:29.000",
    "surface": "snow",
    "author": "Justup and BTBfin (conversion by Thelc)",
    "supportsVariableSurface": true,
    "supportsVariableWetness": true,
    "supportsVariableRain": true,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Evening Clear Crisp",
      "Morning Clear Crisp",
      "Morning PartCloud Hazy",
      "Morning LightCloud NoSnow",
      "Morning HeavyCloud NoSnow",
      "Evening LightCloud LightSnow",
      "Morning HeavyCloud LightSnow",
      "Evening HeavyCloud HeavySnow",
      "Morning HeavyCloud HeavySnow",
      "Morning LightCloud LightFog",
      "Morning LightCloud HeavyFog"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/521.jpg"
  },
  {
    "id": 173,
    "name": "Bisanne II Snow",
    "country": "France",
    "length": "5.6 km",
    "defTime": "6:07.000",
    "surface": "snow",
    "author": "Warthog Games",
    "supportsVariableSurface": true,
    "supportsVariableWetness": true,
    "supportsVariableRain": true,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Noon Clear Crisp",
      "Noon PartCloud Crisp",
      "Noon Clear Hazy",
      "Noon LightCloud NoRain",
      "Noon HeavyCloud LightSnow",
      "Noon HeavyCloud HeavySnow",
      "Noon HeavyCloud LightFog"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/173.jpg"
  },
  {
    "id": 438,
    "name": "Mitterbach Tarmac",
    "country": "Austria",
    "length": "3.0 km",
    "defTime": "2:32.000",
    "surface": "tarmac",
    "author": "Myra43, Martin Bujacek",
    "supportsVariableSurface": true,
    "supportsVariableWetness": true,
    "supportsVariableRain": true,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Noon PartCloud Hazy",
      "Noon HeavyCloud Hazy",
      "Noon HeavyCloud LightSnow",
      "Noon HeavyCloud HeavySnow"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/438.jpg"
  },
  {
    "id": 236,
    "name": "East-West II Tarmac",
    "country": "Australia",
    "length": "9.6 km",
    "defTime": "7:00.000",
    "surface": "tarmac",
    "author": "Warthog Games",
    "supportsVariableSurface": true,
    "supportsVariableWetness": false,
    "supportsVariableRain": false,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Morning Clear Crisp",
      "Morning PartCloud Crisp",
      "Morning Clear Hazy",
      "Morning PartCloud Hazy"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/236.jpg"
  },
  {
    "id": 523,
    "name": "Fintele",
    "country": "Belgium",
    "length": "4.6 km",
    "defTime": "3:59.000",
    "surface": "tarmac",
    "author": "Rodrigo Rodriguez (conversion by Thelc)",
    "supportsVariableSurface": true,
    "supportsVariableWetness": true,
    "supportsVariableRain": true,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Evening Clear Crisp",
      "Morning Clear Crisp",
      "Evening Clear Hazy",
      "Morning PartCloud Hazy",
      "Morning LightCloud Hazy",
      "Morning HeavyCloud Hazy",
      "Morning LightCloud LightRain",
      "Morning HeavyCloud HeavyRain",
      "Morning LightCloud LightFog",
      "Morning LightCloud HeavyFog"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/523.jpg"
  },
  {
    "id": 568,
    "name": "Graciosa I",
    "country": "Brazil",
    "length": "13.9 km",
    "defTime": "11:53.000",
    "surface": "tarmac",
    "author": "NaroGugul",
    "supportsVariableSurface": true,
    "supportsVariableWetness": false,
    "supportsVariableRain": true,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "Noon Clear Crisp",
      "Evening PartCloud Hazy",
      "Morning LightCloud Hazy",
      "Morning HeavyCloud LightFog",
      "Morning HeavyCloud HeavyFog"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/568.jpg"
  },
  {
    "id": 1008,
    "name": "Le barrage des gorges",
    "country": "Canada",
    "length": "9.5 km",
    "defTime": "8:09.000",
    "surface": "tarmac",
    "author": "Bob",
    "supportsVariableSurface": false,
    "supportsVariableWetness": false,
    "supportsVariableRain": false,
    "championshipEligible": true,
    "wetnessOptions": [
      "dry",
      "damp",
      "wet"
    ],
    "weatherOptions": [
      "default"
    ],
    "imageUrl": "https://rallysimfans.hu/rbr/images/stages/1008.jpg"
  }
];

export const MOCK_CAR_GROUPS = [
  {
    "id": 10,
    "name": "WRC 1.6"
  },
  {
    "id": 11,
    "name": "WRC 2.0"
  },
  {
    "id": 21,
    "name": "Group 2"
  },
  {
    "id": 22,
    "name": "Group 4"
  },
  {
    "id": 23,
    "name": "Group A5"
  },
  {
    "id": 78,
    "name": "Group A6"
  },
  {
    "id": 24,
    "name": "Group A7"
  },
  {
    "id": 30,
    "name": "Group A8"
  },
  {
    "id": 31,
    "name": "Group B"
  },
  {
    "id": 32,
    "name": "Group N4"
  },
  {
    "id": 33,
    "name": "Group R1"
  },
  {
    "id": 34,
    "name": "Group R2"
  },
  {
    "id": 35,
    "name": "Group R3"
  },
  {
    "id": 36,
    "name": "Group R4"
  },
  {
    "id": 37,
    "name": "Group R5"
  },
  {
    "id": 38,
    "name": "Group RGT"
  },
  {
    "id": 71,
    "name": "Super 1600"
  },
  {
    "id": 111,
    "name": "Super 2000"
  },
  {
    "id": 118,
    "name": "Rally 5"
  },
  {
    "id": 104,
    "name": "Rally 4"
  },
  {
    "id": 108,
    "name": "Rally 3"
  },
  {
    "id": 125,
    "name": "Rally 2"
  }
];

export const MOCK_CARS = [
  {
    "id": 113,
    "name": "Abarth Grande Punto S2000"
  },
  {
    "id": 102,
    "name": "Alpine A110 Rally RGT"
  },
  {
    "id": 81,
    "name": "Aston Martin Vantage RGT"
  },
  {
    "id": 91,
    "name": "Audi 200 quattro GrpA"
  },
  {
    "id": 87,
    "name": "Audi Sport quattro GrpB"
  },
  {
    "id": 85,
    "name": "Audi quattro A1 GrpB"
  },
  {
    "id": 86,
    "name": "Audi quattro A2 GrpB"
  },
  {
    "id": 26,
    "name": "Audi quattro Grp4"
  },
  {
    "id": 122,
    "name": "BMW M1 GrpB"
  },
  {
    "id": 107,
    "name": "BMW M3 E30 GrpA"
  },
  {
    "id": 110,
    "name": "BMW M3 E36 GrpA"
  },
  {
    "id": 72,
    "name": "Citroen C2 GT S1600"
  },
  {
    "id": 44,
    "name": "Citroen C2 R2 Max"
  },
  {
    "id": 88,
    "name": "Citroen C3 R5"
  },
  {
    "id": 18,
    "name": "Citroen C3 WRC 2017"
  },
  {
    "id": 16,
    "name": "Citroen C4 WRC 2008"
  },
  {
    "id": 42,
    "name": "Citroen DS3 R1"
  },
  {
    "id": 49,
    "name": "Citroen DS3 R3-MAX"
  }
];

export const MOCK_RALLY_OPTIONS = {
  "damageLevels": [
    {
      "value": "2",
      "label": "Reduced"
    },
    {
      "value": "3",
      "label": "Realistic"
    }
  ],
  "pacenotesOptions": [
    "Normal Pacenotes",
    "Don't show 3D pacenotes",
    "Don't show the countdown of pacenote distance",
    "Don't show the 3D pacenote and countdown of pacenote distance",
    "Only pacenote audio",
    "No pacenote symbols and audio"
  ],
  "roadSideService": [
    "no",
    "2 minutes",
    "3 minutes",
    "5 minutes"
  ],
  "superRally": [
    "disabled",
    "150%"
  ],
  "surfaceAge": [
    {
      "value": "1",
      "label": "New"
    },
    {
      "value": "2",
      "label": "Normal"
    },
    {
      "value": "3",
      "label": "Worn"
    }
  ],
  "tyreOptions": [
    "Tarmac Dry",
    "Tarmac Intermediate",
    "Tarmac Wet",
    "Gravel Dry",
    "Gravel Intermediate",
    "Gravel Wet",
    "Snow"
  ],
  "wetnessOptions": [
    "dry",
    "damp",
    "wet"
  ],
  "weatherOptions": [
    "Morning Clear Crisp",
    "Morning HeavyCloud Hazy",
    "Morning HeavyCloud HeavyRain"
  ],
  "serviceTime": [
    "No Service",
    "2 minutes",
    "3 minutes",
    "4 minutes",
    "5 minutes",
    "10 minutes",
    "15 minutes",
    "20 minutes",
    "30 minutes",
    "45 minutes",
    "60 minutes"
  ],
  "mechanicsCount": [
    "No Service",
    "2 mechanic",
    "3 mechanic",
    "4 mechanic",
    "5 mechanic",
    "6 mechanic"
  ],
  "mechanicsSkill": [
    "No Service",
    "Inexperienced",
    "Proficient",
    "Competent",
    "Skilled",
    "Expert"
  ]
};
