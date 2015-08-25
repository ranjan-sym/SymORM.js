var categories = [
  {
    _type: ["category", "category_root"],
    id: 1,
    name: "Administrative",
    description: "Stations classified by administrative divisions",
    isRequired: true,
    isMandatory: true,
    mutuallyExclusive: true,
    maximumSuccessorDepth: 1,
    requiresUniqueId: false,

    children: [
      {
        _type: ["category", "category_child"],
        id: 2,
        name: "Paro",

        stations: [
          {
            _type: "station_category",
            id: 1,
            unique_id: null,
            station: {
              _type: "station",
              id: 101,
              identifier: "47066",
              name: "Gunitsawa"
            }
          }, {
            _type: "station_category",
            id: 2,
            unique_id: null,
            station: {
              _type: "station",
              id: 102,
              identifier: "46578",
              name: "Chelela"
            }
          }
        ]
      },
      {
        _type: ["category", "category_child"],
        id: 3,
        name: "Thimphu",

        stations: [
          {
            _type: "station_category",
            id: 3,
            unique_id: null,
            station: {
              _type: "station",
              id: 103,
              identifier: "56789",
              name: "Thimphu City"
            }
          }, {
            _type: "station_category",
            id: 4,
            unique_id: null,
            station: {
              _type: "station",
              id: 104,
              identifier: "56788",
              name: "Hongtsho"
            }
          }
        ]
      }
    ]
  }
];

var station = {
  _type: "station",
  id: 101,
  identifier: "47066",
  name: "Gunitsawa",
  longitude: 0,
  latitude: 0,
  elevation: 0,
  description: "Hydrological Station installed in HYCOS project",
  metaData: [
    {
      _type: "station_meta_data",
      id: 1,
      metaData: { _type: "meta_data", id: 1, caption: "Observer"},
      value: "Tshering Wanchuk"
    }, {
      _type: "station_meta_data",
      id: 2,
      metaData: { _type: "meta_data", id:2, caption: "Landmark"},
      value: "Inside Army Barrack"
    }
  ]
};