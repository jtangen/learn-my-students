// ═══════════════════════════════════
// Fuzzy Name Matching
// Jaro-Winkler + Double Metaphone + Nicknames
// ═══════════════════════════════════

// ─── Jaro-Winkler Distance ───

function jaro(s1, s2) {
  if (s1 === s2) return 1;
  const len1 = s1.length, len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

export function jaroWinkler(s1, s2) {
  const jaroScore = jaro(s1, s2);

  // Common prefix length (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaroScore + prefix * 0.1 * (1 - jaroScore);
}

// ─── Double Metaphone (simplified) ───
// Produces phonetic codes for English names

export function doubleMetaphone(word) {
  if (!word) return ['', ''];
  const w = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (!w) return ['', ''];

  let primary = '';
  let secondary = '';
  let i = 0;
  const len = w.length;

  function at(pos) { return pos >= 0 && pos < len ? w[pos] : ''; }
  function sliceAt(pos, n) { return w.slice(pos, pos + n); }

  // Skip initial silent letters
  if (['GN', 'KN', 'PN', 'AE', 'WR'].includes(sliceAt(0, 2))) i++;

  while (i < len && primary.length < 6) {
    const ch = w[i];
    const next = at(i + 1);

    switch (ch) {
      case 'A': case 'E': case 'I': case 'O': case 'U':
        if (i === 0) { primary += 'A'; secondary += 'A'; }
        i++;
        break;

      case 'B':
        primary += 'P'; secondary += 'P';
        i += (next === 'B') ? 2 : 1;
        break;

      case 'C':
        if (next === 'H') {
          primary += 'X'; secondary += 'X'; i += 2;
        } else if (['I', 'E', 'Y'].includes(next)) {
          primary += 'S'; secondary += 'S'; i += 2;
        } else {
          primary += 'K'; secondary += 'K';
          i += (next === 'C' && !['I', 'E'].includes(at(i + 2))) ? 2 : 1;
        }
        break;

      case 'D':
        if (next === 'G' && ['I', 'E', 'Y'].includes(at(i + 2))) {
          primary += 'J'; secondary += 'J'; i += 3;
        } else {
          primary += 'T'; secondary += 'T'; i += (next === 'D') ? 2 : 1;
        }
        break;

      case 'F':
        primary += 'F'; secondary += 'F'; i += (next === 'F') ? 2 : 1;
        break;

      case 'G':
        if (next === 'H') {
          if (i > 0 && !'AEIOUY'.includes(at(i - 1))) { i += 2; }
          else { primary += 'K'; secondary += 'K'; i += 2; }
        } else if (['I', 'E', 'Y'].includes(next)) {
          primary += 'J'; secondary += 'K'; i += 2;
        } else if (next === 'G') {
          primary += 'K'; secondary += 'K'; i += 2;
        } else {
          primary += 'K'; secondary += 'K'; i++;
        }
        break;

      case 'H':
        if ('AEIOUY'.includes(next) && (i === 0 || !'AEIOUY'.includes(at(i - 1)))) {
          primary += 'H'; secondary += 'H'; i += 2;
        } else {
          i++;
        }
        break;

      case 'J':
        primary += 'J'; secondary += 'H'; i += (next === 'J') ? 2 : 1;
        break;

      case 'K':
        primary += 'K'; secondary += 'K'; i += (next === 'K') ? 2 : 1;
        break;

      case 'L':
        primary += 'L'; secondary += 'L'; i += (next === 'L') ? 2 : 1;
        break;

      case 'M':
        primary += 'M'; secondary += 'M'; i += (next === 'M') ? 2 : 1;
        break;

      case 'N':
        primary += 'N'; secondary += 'N'; i += (next === 'N') ? 2 : 1;
        break;

      case 'P':
        if (next === 'H') {
          primary += 'F'; secondary += 'F'; i += 2;
        } else {
          primary += 'P'; secondary += 'P'; i += (next === 'P') ? 2 : 1;
        }
        break;

      case 'Q':
        primary += 'K'; secondary += 'K'; i += (next === 'Q') ? 2 : 1;
        break;

      case 'R':
        primary += 'R'; secondary += 'R'; i += (next === 'R') ? 2 : 1;
        break;

      case 'S':
        if (next === 'H') {
          primary += 'X'; secondary += 'X'; i += 2;
        } else if (sliceAt(i, 3) === 'SIO' || sliceAt(i, 3) === 'SIA') {
          primary += 'X'; secondary += 'S'; i += 3;
        } else {
          primary += 'S'; secondary += 'S';
          i += (next === 'S' || next === 'Z') ? 2 : 1;
        }
        break;

      case 'T':
        if (next === 'H') {
          primary += '0'; secondary += 'T'; i += 2;
        } else if (sliceAt(i, 3) === 'TIO' || sliceAt(i, 3) === 'TIA') {
          primary += 'X'; secondary += 'X'; i += 3;
        } else {
          primary += 'T'; secondary += 'T'; i += (next === 'T') ? 2 : 1;
        }
        break;

      case 'V':
        primary += 'F'; secondary += 'F'; i += (next === 'V') ? 2 : 1;
        break;

      case 'W':
        if ('AEIOUY'.includes(next)) {
          primary += 'A'; secondary += 'F'; i += 2;
        } else {
          i++;
        }
        break;

      case 'X':
        primary += 'KS'; secondary += 'KS'; i += (next === 'X') ? 2 : 1;
        break;

      case 'Y':
        if ('AEIOUY'.includes(next)) {
          primary += 'A'; secondary += 'A'; i += 2;
        } else {
          i++;
        }
        break;

      case 'Z':
        primary += 'S'; secondary += 'S'; i += (next === 'Z') ? 2 : 1;
        break;

      default:
        i++;
    }
  }

  return [primary.slice(0, 6), secondary.slice(0, 6)];
}

// ─── Nickname Lookup ───

const NICKNAME_MAP = {
  'robert': ['bob', 'rob', 'robbie', 'bobby'],
  'william': ['will', 'bill', 'billy', 'liam', 'willy'],
  'elizabeth': ['liz', 'beth', 'lizzie', 'eliza', 'betty'],
  'katherine': ['kate', 'kathy', 'katie', 'kat', 'catherine', 'cathy'],
  'michael': ['mike', 'mikey', 'mick'],
  'jennifer': ['jen', 'jenny', 'jenn'],
  'christopher': ['chris', 'topher'],
  'alexander': ['alex', 'lex', 'xander'],
  'benjamin': ['ben', 'benny', 'benji'],
  'nicholas': ['nick', 'nico', 'nicky'],
  'daniel': ['dan', 'danny'],
  'matthew': ['matt', 'matty'],
  'joseph': ['joe', 'joey'],
  'joshua': ['josh'],
  'andrew': ['andy', 'drew'],
  'james': ['jim', 'jimmy', 'jamie'],
  'thomas': ['tom', 'tommy'],
  'richard': ['rick', 'dick', 'rich', 'ricky'],
  'patricia': ['pat', 'trish', 'patty'],
  'margaret': ['maggie', 'meg', 'peggy', 'marg'],
  'samantha': ['sam', 'sammy'],
  'jonathan': ['jon', 'jonny', 'nathan'],
  'timothy': ['tim', 'timmy'],
  'anthony': ['tony'],
  'stephanie': ['steph', 'stephie'],
  'victoria': ['vicky', 'tori', 'vic'],
  'abigail': ['abby', 'abi'],
  'natalie': ['nat', 'nattie'],
  'gabriella': ['gabby', 'gabi', 'ella'],
  'rebecca': ['becca', 'becky'],
  'samuel': ['sam', 'sammy'],
  'frederick': ['fred', 'freddy', 'freddie'],
  'theodore': ['ted', 'teddy', 'theo'],
  'edward': ['ed', 'eddie', 'ned', 'ted'],
  'charles': ['charlie', 'chuck'],
  'catherine': ['cate', 'cat', 'kate', 'cathy'],
  'christina': ['chris', 'tina', 'christy'],
  'jessica': ['jess', 'jessie'],
  'alexandra': ['alex', 'alexa', 'lexi'],
  'phillip': ['phil'],
  'stephen': ['steve', 'steven'],
  'steven': ['steve', 'stephen'],
  'david': ['dave', 'davey'],
  'gregory': ['greg'],
  'peter': ['pete'],
  'raymond': ['ray'],
  'lawrence': ['larry', 'laurie'],
  'leonard': ['leo', 'lenny'],
  'eugene': ['gene'],
  'susanna': ['sue', 'susie', 'suzy'],
  'deborah': ['deb', 'debbie'],
  'dorothy': ['dot', 'dottie'],
};

// Build reverse lookup
const REVERSE_NICKNAMES = {};
for (const [formal, nicks] of Object.entries(NICKNAME_MAP)) {
  for (const nick of nicks) {
    if (!REVERSE_NICKNAMES[nick]) REVERSE_NICKNAMES[nick] = [];
    REVERSE_NICKNAMES[nick].push(formal);
  }
  // Also map formal to itself for bidirectional lookup
  if (!REVERSE_NICKNAMES[formal]) REVERSE_NICKNAMES[formal] = [];
}

function isNickname(input, target) {
  const a = input.toLowerCase();
  const b = target.toLowerCase();

  // Check if input is a nickname for the target's formal name
  const formalsOfA = REVERSE_NICKNAMES[a] || [];
  if (formalsOfA.includes(b)) return true;

  // Check if target is a nickname for the input's formal name
  const formalsOfB = REVERSE_NICKNAMES[b] || [];
  if (formalsOfB.includes(a)) return true;

  // Check if they share a formal name
  const nicksOfB = NICKNAME_MAP[b] || [];
  if (nicksOfB.includes(a)) return true;

  const nicksOfA = NICKNAME_MAP[a] || [];
  if (nicksOfA.includes(b)) return true;

  return false;
}

// ─── Combined Matching ───

/**
 * Match a user's input against a target name with tiered feedback.
 *
 * @returns {{ match: string, score: number, grade: number, feedback: string }}
 *   - match: 'exact' | 'close' | 'almost' | 'phonetic' | 'nickname' | 'close_wrong' | 'wrong'
 *   - score: 0-1 similarity score
 *   - grade: FSRS grade (1=Again, 2=Hard, 3=Good, 4=Easy)
 *   - feedback: human-readable feedback string
 */
export function matchName(input, target) {
  if (!input || !target) return { match: 'wrong', score: 0, grade: 1, feedback: 'Not quite...' };

  const a = input.toLowerCase().trim();
  const b = target.toLowerCase().trim();

  // Exact match
  if (a === b) return { match: 'exact', score: 1.0, grade: 4, feedback: 'Correct!' };

  // Jaro-Winkler similarity
  const jw = jaroWinkler(a, b);

  if (jw >= 0.92) {
    return { match: 'close', score: jw, grade: 3, feedback: 'Correct! (small typo)' };
  }

  if (jw >= 0.85) {
    return { match: 'almost', score: jw, grade: 2, feedback: `Almost! It's "${target}"` };
  }

  // Phonetic match
  const [p1a, p1b] = doubleMetaphone(a);
  const [p2a, p2b] = doubleMetaphone(b);
  if (p1a && p2a && (p1a === p2a || p1a === p2b || (p1b && (p1b === p2a || p1b === p2b)))) {
    return { match: 'phonetic', score: 0.85, grade: 2, feedback: `Right sound! Spelled "${target}"` };
  }

  // Nickname match
  if (isNickname(a, b)) {
    return { match: 'nickname', score: 0.80, grade: 2, feedback: `That's a nickname! Full name: "${target}"` };
  }

  // Close but wrong
  if (jw >= 0.70) {
    return { match: 'close_wrong', score: jw, grade: 1, feedback: `Close! It's "${target}"` };
  }

  // Wrong
  return { match: 'wrong', score: jw, grade: 1, feedback: 'Not quite...' };
}

/**
 * Match input against both preferred name and family name,
 * returning the best match.
 */
export function matchStudentName(input, preferredName, familyName) {
  const preferred = matchName(input, preferredName);
  const family = matchName(input, familyName);

  // Prefer the better match
  if (preferred.score >= family.score) return preferred;
  return family;
}
