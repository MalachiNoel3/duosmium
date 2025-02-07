const fs = require("fs");

if (!process.env.ELEVENTY_SERVERLESS) {
  // explicitly use var for global scoping
  var { ContrastChecker } = require("color-contrast-calc");
  var { extractColors } = require("extract-colors");
  var chroma = require("chroma-js");
}

const STATES_BY_POSTAL_CODE = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  nCA: "Northern California",
  sCA: "Southern California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

// find the correct capitalization for a tournament file
// excludes file extension
function canonicalCase(filename) {
  filename = filename.split(".")[0];
  const filenames = fs
    .readdirSync("./data")
    .flatMap((filename) =>
      /^[0-9].*/.test(filename) ? [filename.split(".")[0]] : []
    );
  if (filenames.includes(filename)) {
    return filename;
  }
  return (
    filenames.find((f) => f.toLowerCase() === filename.toLowerCase()) ??
    filename
  );
}

// used for setting the meta canonical tag for SEO
function canonicalizePath(filename) {
  const parts = filename.split("/");
  const filenames = fs
    .readdirSync("./data")
    .flatMap((filename) =>
      /^[0-9].*/.test(filename) ? [filename.split(".")[0]] : []
    );

  return parts
    .map((part) => {
      if (filenames.includes(part)) {
        return part;
      }
      return (
        filenames.find((f) => f.toLowerCase() === part.toLowerCase()) ?? part
      );
    })
    .join("/");
}

function generateFilename(interpreter) {
  let output = "";
  output += interpreter.tournament.startDate.getFullYear();
  output +=
    "-" +
    (interpreter.tournament.startDate.getUTCMonth() + 1)
      .toString()
      .padStart(2, "0");
  output +=
    "-" +
    interpreter.tournament.startDate.getUTCDate().toString().padStart(2, "0");
  switch (interpreter.tournament.level) {
    case "Nationals":
      output += "_nationals";
      break;
    case "States":
      output += `_${interpreter.tournament.state}_states`;
      break;
    case "Regionals":
      output += `_${interpreter.tournament.state}_${(
        interpreter.tournament.shortName ?? interpreter.tournament.name
      )
        .toLowerCase()
        .split("regional")[0]
        .replace(/\./g, "")
        .replace(/[^A-Za-z0-9-]/g, "_")}regional`;
      break;
    default:
      output += `_${(
        interpreter.tournament.shortName ?? interpreter.tournament.name
      )
        .toLowerCase()
        .split("invitational")[0]
        .replace(/\./g, "")
        .replace(/[^A-Za-z0-9-]/g, "_")}invitational`;
      break;
  }
  output += "_" + interpreter.tournament.division.toLowerCase();
  return output;
}

function findLogoPath(filename) {
  const cached = JSON.parse(
    fs.readFileSync("./cache/tourn-images.json", "utf8")
  );
  if (cached[filename]) {
    return cached[filename];
  }
  if (process.env.ELEVENTY_SERVERLESS) {
    return "/images/logos/default.jpg";
  }

  const tournamentYear = parseInt(filename.slice(0, 4));
  const tournamentName = filename.slice(11, -2);
  const getYear = (image) => parseInt(image.match(/^\d+/)?.[0] ?? 0);

  const images = fs.readdirSync("./src/images/logos");
  const sameDivision = images.filter((image) =>
    filename.endsWith(image.split(".")[0].match(/_[abc]$/)?.[0] ?? "")
  );

  const hasTournName = sameDivision.filter((image) =>
    image.includes(tournamentName)
  );

  // use state logo if regional logo does not exist
  let stateFallback = [];
  if (/_regional_[abc]$/.test(filename)) {
    const stateName = filename.split("_")[1] + "_states";
    stateFallback = sameDivision.filter((image) => image.includes(stateName));
  }

  // remove format info from name
  let withoutFormat = [];
  if (/(mini|satellite|in-person)_?(so)?_/.test(filename)) {
    const nameWithoutFormat = tournamentName.replace(
      /(mini|satellite|in-person)_?(so)?_/,
      ""
    );
    withoutFormat = sameDivision.filter((image) =>
      image.includes(nameWithoutFormat)
    );
  }

  const recentYear = hasTournName
    .concat(...withoutFormat, stateFallback, "default.jpg")
    .filter((image) => getYear(image) <= tournamentYear);
  const selected = recentYear.reduce((prev, curr) => {
    const currentScore = getYear(curr) + curr.length / 100;
    const prevScore = getYear(prev) + prev.length / 100;
    return currentScore > prevScore ? curr : prev;
  });

  cached[filename] = "/images/logos/" + selected;
  fs.writeFileSync("./cache/tourn-images.json", JSON.stringify(cached));
  return "/images/logos/" + selected;
}

async function findBgColor(filename) {
  const cached = JSON.parse(fs.readFileSync("./cache/bg-colors.json", "utf8"));
  if (cached[filename]) {
    return cached[filename];
  }
  if (process.env.ELEVENTY_SERVERLESS) {
    return "#1f1b35";
  }

  const colors = await extractColors("./src" + findLogoPath(filename, true));
  let chosenColor = chroma(
    colors.reduce((prev, curr) =>
      // choose color based on area if saturation is past
      // a threshold value, otherwise fallback to saturation
      curr.saturation > 0.05 && prev.saturation > 0.05
        ? curr.area > prev.area
          ? curr
          : prev
        : curr.saturation > prev.saturation
        ? curr
        : prev
    ).hex
  );
  while (ContrastChecker.contrastRatio("#f5f5f5", chosenColor.hex()) < 5.5) {
    chosenColor = chosenColor.darken();
  }
  cached[filename] = chosenColor.hex();
  fs.writeFileSync("./cache/bg-colors.json", JSON.stringify(cached));
  return chosenColor.hex();
}

const trophyAndMedalColors = [
  "#ffee58",
  "#cfd8dc",
  "#d8bf99",
  "#ffefc0",
  "#dcedc8",
  "#eeccff",
  "#fdd5b4",
  "#d4f0f1",
  "#ffc8db",
  "#dab9d1",
  "#e5e5e5",
  "#e5e5e5",
  "#e5e5e5",
  "#e5e5e5",
  "#e5e5e5",
  "#f4f4f4",
  "#f4f4f4",
  "#f4f4f4",
  "#f4f4f4",
  "#f4f4f4",
];

function trophyAndMedalCss(trophies, medals, reverse = false) {
  return trophyAndMedalColors
    .map((color, i) => {
      let output = [];
      if (i < medals) {
        output.push(
          `td.event-points[data-points='${reverse ? reverse - i : i + 1}'] div`
        );
        output.push(
          `td.event-points-focus[data-points='${
            reverse ? reverse - i : i + 1
          }'] div`
        );
        output.push(
          `div#team-detail tr[data-points='${reverse ? reverse - i : i + 1}']`
        );
      }
      if (i < trophies) {
        output.push(`td.rank[data-points='${i + 1}'] div`);
      }
      if (output.length > 0) {
        output =
          output.join(",") + `{background-color: ${color};border-radius: 1em;}`;
      }
      return output;
    })
    .join("");
}

function tournamentTitle(tInfo) {
  if (tInfo.name) return tInfo.name;

  switch (tInfo.level) {
    case "Nationals":
      return "Science Olympiad National Tournament";
    case "States":
      return `${expandStateName(
        tInfo.state
      )} Science Olympiad State Tournament`;
    case "Regionals":
      return `${tInfo.location} Regional Tournament`;
    case "Invitational":
      return `${tInfo.location} Invitational`;
  }
}

function tournamentTitleShort(tInfo) {
  switch (tInfo.level) {
    case "Nationals":
      return "National Tournament";
    case "States":
      return `${tInfo.state
        .replace("sCA", "SoCal")
        .replace("nCA", "NorCal")} State Tournament`;
    case "Regionals":
    case "Invitational":
      if (!tInfo.shortName) {
        let cut = tInfo.level === "Regionals" ? "Regional" : "Invitational";
        let splits = tInfo.name.split(cut, 2)[0];
        return `${splits} ${cut}${cut === "Regional" ? " Tournament" : ""}`;
      }
      return tInfo.shortName;
  }
}

function acronymize(phrase) {
  return phrase
    .split(" ")
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join("");
}

function expandStateName(postalCode) {
  return STATES_BY_POSTAL_CODE[postalCode];
}

function formatSchool(team) {
  if (team.schoolAbbreviation) {
    return abbrSchool(team.schoolAbbreviation);
  }
  return abbrSchool(team.school);
}

function abbrSchool(school) {
  return school
    .replace("Elementary School", "Elementary")
    .replace("Elementary/Middle School", "E.M.S.")
    .replace("Middle School", "M.S.")
    .replace("Junior High School", "J.H.S.")
    .replace(/Middle[ /-]High School/, "M.H.S")
    .replace("Junior/Senior High School", "Jr./Sr. H.S.")
    .replace("High School", "H.S.")
    .replace("Secondary School", "Secondary");
}

function fullSchoolName(team) {
  const location = team.city
    ? `(${team.city}, ${team.state})`
    : `(${team.state})`;
  return `${team.school} ${location}`;
}

function fullTeamName(team) {
  const location = team.city
    ? `(${team.city}, ${team.state})`
    : `(${team.state})`;
  return `${team.school} ${team.suffix ? team.suffix + " " : ""}${location}`;
}

function keywords(interpreter) {
  const t = interpreter.tournament;
  const words = [
    "science",
    "olympiad",
    "tournament",
    t.name,
    t.short_name,
    t.location,
    t.name ? acronymize(t.name) : null,
    t.location ? acronymize(t.location) : null,
    t.level,
    t.level == "Nationals" ? "nats" : null,
    t.level == "Nationals" ? "sont" : null,
    t.level == "Invitational" ? "invite" : null,
    t.state,
    t.state ? expandStateName(t.state) : null,
    `div-${t.division}`,
    `division-${t.division}`,
    t.year,
    t.date ? t.date.toISOString().split("T")[0] : null,
    t.date
      ? t.date.toLocaleDateString(undefined, {
          weekday: "long",
          timeZone: "UTC",
        })
      : null,
    t.date
      ? t.date.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" })
      : null,
    t.date ? t.date.getUTCDate() : null,
    t.date ? t.date.getUTCFullYear() : null,
    t.startDate ? t.startDate.toISOString().split("T")[0] : null,
    t.startDate
      ? t.startDate.toLocaleDateString(undefined, {
          weekday: "long",
          timeZone: "UTC",
        })
      : null,
    t.startDate
      ? t.startDate.toLocaleDateString(undefined, {
          month: "long",
          timeZone: "UTC",
        })
      : null,
    t.startDate ? t.startDate.getUTCDate() : null,
    t.startDate ? t.startDate.getUTCFullYear() : null,
    t.endDate ? t.endDate.toISOString().split("T")[0] : null,
    t.endDate
      ? t.endDate.toLocaleDateString(undefined, {
          weekday: "long",
          timeZone: "UTC",
        })
      : null,
    t.endDate
      ? t.endDate.toLocaleDateString(undefined, {
          month: "long",
          timeZone: "UTC",
        })
      : null,
    t.endDate ? t.endDate.getUTCDate() : null,
    t.endDate ? t.endDate.getUTCFullYear() : null,
  ];
  return Array.from(
    words
      // dedupe, convert to lowercase, remove nulls
      .reduce((acc, v) => {
        if (v) {
          acc.add(v.toString().toLowerCase());
        }
        return acc;
      }, new Set())
  );
}

function searchString(interpreter) {
  return keywords(interpreter).join("|");
}

function teamAttended(team) {
  return team.placings.map((p) => p.participated).some((p) => p);
}

const summaryTitles = [
  "Champion",
  "Runner-up",
  "Third-place",
  "Fourth-place",
  "Fifth-place",
  "Sixth-place",
];

function supTag(placing) {
  const exempt = placing.exempt || placing.droppedAsPartOfWorstPlacings;
  const tie = placing.tie && !placing.pointsLimitedByMaximumPlace;
  if (tie || exempt) {
    return `<sup>${exempt ? "◊" : ""}${tie ? "*" : ""}</sup>`;
  }
  return "";
}

function bidsSupTag(team) {
  return team.earnedBid ? "<sup>✧</sup>" : "";
}

function bidsSupTagNote(tournament) {
  const nextTournament =
    tournament.level === "Regionals"
      ? `${tournament.state
          .replace("sCA", "SoCal")
          .replace("nCA", "NorCal")} State Tournament`
      : "National Tournament";
  const qualifiee = tournament.bidsPerSchool > 1 ? "team" : "school";
  return `Qualified ${qualifiee} for the ${tournament.year} ${nextTournament}`;
}

function placingNotes(placing) {
  const place = placing.place;
  const points = placing.isolatedPoints;
  return [
    placing.event.trial ? "trial event" : null,
    placing.event.trialed ? "trialed event" : null,
    placing.disqualified ? "disqualified" : null,
    placing.didNotParticipate ? "did not participate" : null,
    placing.participationOnly ? "participation points only" : null,
    placing.tie ? "tie" : null,
    placing.exempt ? "exempt" : null,
    placing.pointsLimitedByMaximumPlace ? "points limited" : null,
    placing.unknown ? "unknown place" : null,
    placing.pointsAffectedByExhibition && place - points == 1
      ? "placed behind exhibition team"
      : null,
    placing.pointsAffectedByExhibition && place - points > 1
      ? "placed behind exhibition teams"
      : null,
    placing.droppedAsPartOfWorstPlacings ? "dropped" : null,
  ]
    .flatMap((s) => (s ? [s[0].toUpperCase() + s.slice(1)] : []))
    .join(", ");
}

function teamsToStates(interpreter) {
  return Array.from(
    interpreter.teams.reduce((acc, t) => {
      acc.add(t.state);
      return acc;
    }, new Set())
  ).sort((a, b) => a.localeCompare(b));
}

function fmtDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function timeDelta(time) {
  return Date.now() - time;
}

module.exports = {
  canonicalCase,
  canonicalizePath,
  generateFilename,
  findLogoPath,
  findBgColor,
  trophyAndMedalCss,
  tournamentTitle,
  tournamentTitleShort,
  formatSchool,
  fullSchoolName,
  fullTeamName,
  keywords,
  searchString,
  teamAttended,
  summaryTitles,
  supTag,
  bidsSupTag,
  bidsSupTagNote,
  placingNotes,
  teamsToStates,
  fmtDate,
  timeDelta,
};
