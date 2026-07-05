// Bank Soal Teka Teki Silang (TTS) - 10 Layouts (10x10, 10 Questions each)
// Every Across word is placed on a unique row, and every Down word is on a unique column to prevent merging.
// The 2D matrix grids are generated dynamically at load-time from the clues.

export const crosswordLayouts = [
  {
    id: 1,
    title: "Digital Arena",
    background: "Black and White Modern Background A4 Document.png",
    clues: {
      across: [
        { num: 1, row: 1, col: 0, question: "A hand-held pointing device for computers (5 letters)", answer: "MOUSE" },
        { num: 2, row: 3, col: 2, question: "Data entered into a computer for processing (5 letters)", answer: "INPUT" },
        { num: 3, row: 5, col: 4, question: "Produce a paper copy of computer data (5 letters)", answer: "PRINT" },
        { num: 4, row: 7, col: 5, question: "Achieved without difficulty; simple (4 letters)", answer: "EASY" },
        { num: 5, row: 9, col: 6, question: "A form of play or sport, especially a competitive one (4 letters)", answer: "GAME" }
      ],
      down: [
        { num: 6, row: 0, col: 1, question: "Instructions written in a programming language (4 letters)", answer: "CODE" },
        { num: 7, row: 2, col: 3, question: "An individual thing or person regarded as single (4 letters)", answer: "UNIT" },
        { num: 8, row: 4, col: 5, question: "Able to act at will; not under physical constraint (4 letters)", answer: "FREE" },
        { num: 9, row: 6, col: 7, question: "Request information from someone, or pose a question (3 letters)", answer: "ASK" },
        { num: 10, row: 6, col: 9, question: "A stored document containing data on disk (4 letters)", answer: "FILE" }
      ]
    }
  },
  {
    id: 2,
    title: "Space Explorers",
    background: "Blue Green And White Illustrative School Background A4.png",
    clues: {
      across: [
        { num: 1, row: 1, col: 0, question: "The region beyond the earth's atmosphere (5 letters)", answer: "SPACE" },
        { num: 2, row: 3, col: 2, question: "A celestial object consisting of a nucleus of ice and dust (5 letters)", answer: "COMET" },
        { num: 3, row: 5, col: 4, question: "Relating to or determined by the sun (5 letters)", answer: "SOLAR" },
        { num: 4, row: 7, col: 5, question: "An intention or decision about what one is going to do (4 letters)", answer: "PLAN" },
        { num: 5, row: 9, col: 6, question: "The fourth planet from the sun in our solar system (4 letters)", answer: "MARS" }
      ],
      down: [
        { num: 6, row: 0, col: 1, question: "The highest point, or vertex of a triangle (4 letters)", answer: "APEX" },
        { num: 7, row: 2, col: 3, question: "A region or area distinguished from other parts (4 letters)", answer: "ZONE" },
        { num: 8, row: 4, col: 5, question: "A structure shape forming a closed curve (4 letters)", answer: "LOOP" },
        { num: 9, row: 6, col: 1, question: "A substance in a physical state with no fixed shape or volume (3 letters)", answer: "GAS" },
        { num: 10, row: 6, col: 9, question: "Spherical celestial bodies orbiting a star (4 letters)", answer: "ORBS" }
      ]
    }
  },
  {
    id: 3,
    title: "Nature & Earth",
    background: "Blue and White Watercolor Mountain Landscape A4.png",
    clues: {
      across: [
        { num: 1, row: 1, col: 0, question: "A large natural stream of water flowing in a channel (5 letters)", answer: "RIVER" },
        { num: 2, row: 3, col: 2, question: "A living organism of the kind exemplified by trees (5 letters)", answer: "PLANT" },
        { num: 3, row: 5, col: 4, question: "The color of growing grass and leaves (5 letters)", answer: "GREEN" },
        { num: 4, row: 7, col: 5, question: "The point or direction where the sun rises; morning (4 letters)", answer: "EAST" },
        { num: 5, row: 9, col: 6, question: "A combustible black rock used as fuel (4 letters)", answer: "COAL" }
      ],
      down: [
        { num: 6, row: 0, col: 1, question: "The perceptible natural movement of the air (4 letters)", answer: "WIND" },
        { num: 7, row: 2, col: 3, question: "Stiffer, sticky fine-grained earth used to make pottery (4 letters)", answer: "CLAY" },
        { num: 8, row: 4, col: 5, question: "A woody perennial plant, typically having a single stem (4 letters)", answer: "TREE" },
        { num: 9, row: 6, col: 7, question: "Powdery residue left after the burning of a substance (3 letters)", answer: "ASH" },
        { num: 10, row: 6, col: 9, question: "A naturally raised area of land, lower than a mountain (4 letters)", answer: "HILL" }
      ]
    }
  },
  {
    id: 4,
    title: "Food & Kitchen",
    background: "Blue_and_Green_Playful_Illustrative_Landscape_Zoom_Virtual_Background.png",
    clues: {
      across: [
        { num: 1, row: 1, col: 0, question: "A swollen edible bulb with a pungent taste and smell (5 letters)", answer: "ONION" },
        { num: 2, row: 3, col: 2, question: "Food made of baked flour, water, and yeast (5 letters)", answer: "BREAD" },
        { num: 3, row: 5, col: 4, question: "A sweet stone fruit, narrow at stem and wider at base (5 letters)", answer: "PEACH" },
        { num: 4, row: 7, col: 5, question: "Aromatic beverages prepared from cured leaves (4 letters)", answer: "TEAS" },
        { num: 5, row: 9, col: 6, question: "A large marine fish, highly valued as food (4 letters)", answer: "TUNA" }
      ],
      down: [
        { num: 6, row: 0, col: 1, question: "An individual thing or person regarded as single (4 letters)", answer: "UNIT" },
        { num: 7, row: 2, col: 3, question: "A cultivated plant that is grown as food, especially a grain (4 letters)", answer: "CROP" },
        { num: 8, row: 4, col: 5, question: "The flesh of an animal, typically a mammal, as food (4 letters)", answer: "MEAT" },
        { num: 9, row: 6, col: 7, question: "Cured meat from the thigh of a pig's leg (3 letters)", answer: "HAM" },
        { num: 10, row: 6, col: 9, question: "A sweet carbonated drink, or sodium carbonate (4 letters)", answer: "SODA" }
      ]
    }
  },
  {
    id: 5,
    title: "Travel & Places",
    background: "Cream Vintage Background Poster A2 Landscape.png",
    clues: {
      across: [
        { num: 1, row: 1, col: 0, question: "A series of connected railway carriages (5 letters)", answer: "TRAIN" },
        { num: 2, row: 3, col: 2, question: "An establishment providing accommodation for travelers (5 letters)", answer: "HOTEL" },
        { num: 3, row: 5, col: 4, question: "A line of travel or way to get to a destination (5 letters)", answer: "ROUTE" },
        { num: 4, row: 7, col: 5, question: "A journey on a horse, bicycle, or in a vehicle (4 letters)", answer: "RIDE" },
        { num: 5, row: 9, col: 6, question: "A motor vehicle licensed to transport passengers for a fare (4 letters)", answer: "TAXI" }
      ],
      down: [
        { num: 6, row: 0, col: 1, question: "A journey or excursion, especially for pleasure (4 letters)", answer: "TRIP" },
        { num: 7, row: 2, col: 3, question: "A wide way leading from one place to another (4 letters)", answer: "ROAD" },
        { num: 8, row: 4, col: 5, question: "A journey, typically for pleasure, in which several places are visited (4 letters)", answer: "TOUR" },
        { num: 9, row: 6, col: 7, question: "A state of agitation or fuss; trouble (3 letters)", answer: "ADO" },
        { num: 10, row: 6, col: 9, question: "A popular Indonesian resort island (4 letters)", answer: "BALI" }
      ]
    }
  },
  {
    id: 6,
    title: "Sports & Games",
    background: "Green_Yellow_Illustration_Cute_School_Blank_Notes_Background_A4.png",
    clues: {
      across: [
        { num: 1, row: 1, col: 0, question: "A contest in which people or teams compete (5 letters)", answer: "MATCH" },
        { num: 2, row: 3, col: 2, question: "An activity involving physical exertion and skill (5 letters)", answer: "SPORT" },
        { num: 3, row: 5, col: 4, question: "A board game for two players using sixteen pieces each (5 letters)", answer: "CHESS" },
        { num: 4, row: 7, col: 5, question: "A group of players forming one side in a game (4 letters)", answer: "TEAM" },
        { num: 5, row: 9, col: 6, question: "A strong competition between runners, cars, or boats (4 letters)", answer: "RACE" }
      ],
      down: [
        { num: 6, row: 0, col: 1, question: "A spherical object used in various games and sports (4 letters)", answer: "BALL" },
        { num: 7, row: 2, col: 3, question: "Open or ready to be entered, or not restricted (4 letters)", answer: "OPEN" },
        { num: 8, row: 4, col: 5, question: "A single stroke or firing of a gun, or attempt in golf (4 letters)", answer: "SHOT" },
        { num: 9, row: 6, col: 7, question: "A pole with a flat blade used to row a boat (3 letters)", answer: "OAR" },
        { num: 10, row: 6, col: 9, question: "A competitive activity played according to rules (4 letters)", answer: "GAME" }
      ]
    }
  },
  {
    id: 7,
    title: "School & Education",
    background: "Indonesia Blank Background Document A4.png",
    clues: {
      across: [
        { num: 1, row: 1, col: 0, question: "Gain or acquire knowledge or skill in something (5 letters)", answer: "LEARN" },
        { num: 2, row: 3, col: 2, question: "The devotion of time to acquiring knowledge (5 letters)", answer: "STUDY" },
        { num: 3, row: 5, col: 4, question: "A flat surface on which the teacher writes (5 letters)", answer: "BOARD" },
        { num: 4, row: 7, col: 5, question: "Retained or held in possession; preserved (4 letters)", answer: "KEPT" },
        { num: 5, row: 9, col: 6, question: "The science of numbers and their operations (4 letters)", answer: "MATH" }
      ],
      down: [
        { num: 6, row: 0, col: 1, question: "Look at and comprehend the meaning of written matter (4 letters)", answer: "READ" },
        { num: 7, row: 2, col: 3, question: "The main stem of a plant, or science-math educational acronym (4 letters)", answer: "STEM" },
        { num: 8, row: 4, col: 5, question: "A set of written, printed, or blank sheets bound together (4 letters)", answer: "BOOK" },
        { num: 9, row: 6, col: 7, question: "A large primate without a tail, or to mimic (3 letters)", answer: "APE" },
        { num: 10, row: 6, col: 9, question: "A way or track laid down for walking or travel (4 letters)", answer: "PATH" }
      ]
    }
  },
  {
    id: 8,
    title: "Business & Work",
    background: "Orange Brown and Yellow Illustrated Background Poster.png",
    clues: {
      across: [
        { num: 1, row: 1, col: 0, question: "A current medium of exchange in the form of banknotes (5 letters)", answer: "MONEY" },
        { num: 2, row: 3, col: 2, question: "The action of buying and selling goods (5 letters)", answer: "TRADE" },
        { num: 3, row: 5, col: 4, question: "One of the equal parts into which company capital is divided (5 letters)", answer: "SHARE" },
        { num: 4, row: 7, col: 5, question: "An intention or decision about what one is going to do (4 letters)", answer: "PLAN" },
        { num: 5, row: 9, col: 6, question: "The exchange of a commodity for money; action of selling (4 letters)", answer: "SALE" }
      ],
      down: [
        { num: 6, row: 0, col: 1, question: "Activity involving mental or physical effort done for a purpose (4 letters)", answer: "WORK" },
        { num: 7, row: 2, col: 3, question: "Not under the control of another; clear of charge (4 letters)", answer: "FREE" },
        { num: 8, row: 4, col: 5, question: "A building or room where goods are sold (4 letters)", answer: "SHOP" },
        { num: 9, row: 6, col: 7, question: "A fee or charge, or dynamic duty levy (3 letters)", answer: "TAX" },
        { num: 10, row: 6, col: 9, question: "A value or price, or speed of data transfer (4 letters)", answer: "RATE" }
      ]
    }
  },
  {
    id: 9,
    title: "Arts & Entertainment",
    background: "Purple and Green Dynamic Comic Book Blank Note A4 Horizontal.png",
    clues: {
      across: [
        { num: 1, row: 1, col: 0, question: "A story or event recorded by a camera as moving images (5 letters)", answer: "MOVIE" },
        { num: 2, row: 3, col: 2, question: "A raised floor or platform, typically in a theater (5 letters)", answer: "STAGE" },
        { num: 3, row: 5, col: 4, question: "Move rhythmically to music, following set steps (5 letters)", answer: "DANCE" },
        { num: 4, row: 7, col: 5, question: "Objects or devices used for playing, like dolls or cars (4 letters)", answer: "TOYS" },
        { num: 5, row: 9, col: 6, question: "A thin flexible strip of plastic coated with magnetic material (4 letters)", answer: "FILM" }
      ],
      down: [
        { num: 6, row: 0, col: 1, question: "A short poem or other set of words set to music (4 letters)", answer: "SONG" },
        { num: 7, row: 2, col: 3, question: "A luminous body in outer space, or celebrity (4 letters)", answer: "STAR" },
        { num: 8, row: 4, col: 5, question: "A group of actors, singers, or dancers in a play (4 letters)", answer: "CAST" },
        { num: 9, row: 6, col: 7, question: "A friendly departure greeting phrase (3 letters)", answer: "BYE" },
        { num: 10, row: 6, col: 9, question: "A percussion instrument sounded by being struck (4 letters)", answer: "DRUM" }
      ]
    }
  },
  {
    id: 10,
    title: "Health & Science",
    background: "ok.png",
    clues: {
      across: [
        { num: 1, row: 1, col: 0, question: "An abnormally high body temperature with shivering (5 letters)", answer: "FEVER" },
        { num: 2, row: 3, col: 2, question: "A hollow muscular organ that pumps blood (5 letters)", answer: "HEART" },
        { num: 3, row: 5, col: 4, question: "An infective agent that is able to multiply in hosts (5 letters)", answer: "VIRUS" },
        { num: 4, row: 7, col: 5, question: "The digits on the end of a human foot (4 letters)", answer: "TOES" },
        { num: 5, row: 9, col: 6, question: "A medicine or substance which resolves a disease (4 letters)", answer: "CURE" }
      ],
      down: [
        { num: 6, row: 0, col: 1, question: "In a good or satisfactory manner, healthy (4 letters)", answer: "WELL" },
        { num: 7, row: 2, col: 3, question: "The smallest structural and functional unit of life (4 letters)", answer: "CELL" },
        { num: 8, row: 4, col: 5, question: "A special course of food to control weight or health (4 letters)", answer: "DIET" },
        { num: 9, row: 6, col: 7, question: "A metal instrument used to lock or unlock a door (3 letters)", answer: "KEY" },
        { num: 10, row: 6, col: 9, question: "Any of the hard parts of the skeleton of a vertebrate (4 letters)", answer: "BONE" }
      ]
    }
  }
];

// Dynamically generate the 2D grid matrix of size 10x10 for each layout
crosswordLayouts.forEach(layout => {
  const size = 10;
  const grid = Array(size).fill(null).map(() => Array(size).fill(null));

  // Populate Across Clues
  layout.clues.across.forEach(c => {
    const word = c.answer.toUpperCase();
    for (let i = 0; i < word.length; i++) {
      const targetRow = c.row;
      const targetCol = c.col + i;
      if (grid[targetRow][targetCol] !== null && grid[targetRow][targetCol] !== word[i]) {
        throw new Error(`Collision in Layout "${layout.title}" at (${targetRow}, ${targetCol}): expected ${word[i]} but found ${grid[targetRow][targetCol]}`);
      }
      grid[targetRow][targetCol] = word[i];
    }
  });

  // Populate Down Clues
  layout.clues.down.forEach(c => {
    const word = c.answer.toUpperCase();
    for (let i = 0; i < word.length; i++) {
      const targetRow = c.row + i;
      const targetCol = c.col;
      if (grid[targetRow][targetCol] !== null && grid[targetRow][targetCol] !== word[i]) {
        throw new Error(`Collision in Layout "${layout.title}" at (${targetRow}, ${targetCol}): expected ${word[i]} but found ${grid[targetRow][targetCol]}`);
      }
      grid[targetRow][targetCol] = word[i];
    }
  });

  layout.grid = grid;
});
