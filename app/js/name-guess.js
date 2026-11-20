// ═══════════════════════════════════
// Plausible wrong answers
// ═══════════════════════════════════
//
// A multiple-choice question is only a test if the wrong answers could be
// right. A man's face beside three women's names can be answered without
// knowing anyone. So the wrong answers are drawn, where possible, from names
// that usually belong to the same gender as the right one.
//
// This is a guess from the first name and nothing else. It never looks at a
// photo, it is never stored and never shown, and it only decides which other
// names sit beside the right one. Many names can't be placed (Riley, Alex,
// Wei), and for those the wrong answers are drawn from the whole class.

import { DATA_FEMALE, DATA_MALE, DATA_EITHER } from './name-data.js';

const words = (s) => new Set(s.trim().split(/\s+/));

// There are two sets of lists.
//
// The big one (name-data.js, about 35,000 names) is built from the US Social Security
// Administration's national names data by tools/build_name_data.py.
//
// The short ones below were written by hand and are read first. They were checked against the
// top 100 baby names registered in Queensland each year from 1960 to 2007 (Registry of Births,
// Deaths and Marriages, © The State of Queensland, CC BY 3.0 AU), and they are where Australian
// use differs from American, or where a name is too rare in the US data to be in the big list.
// A hand-placed name that the US data shows as mixed was kept only where Queensland's lists
// agree or at least 80% of the US data points the same way; the rest moved to "anyone".

let big = null;
function data() {
  if (!big) big = { f: words(DATA_FEMALE), m: words(DATA_MALE), either: words(DATA_EITHER) };
  return big;
}

// Names used for anyone. These are checked first, so the endings below
// can't claim them.
const EITHER = words(`
  alex sam charlie jamie jordan taylor riley casey morgan jesse jessie lee kerry
  lesley leslie terry chris pat ashley bailey darcy quinn skylar skyler rowan
  robin kim sasha nikita mika jean jan dana jody kiran noor nour yuki angel
  sydney sidney devon dakota remy rene dominique claude ariel eden kai noa jaime
  lindsay lindsey shannon mackenzie reese peyton avery parker sawyer finley
  emery blair drew frankie stevie nicky sandy mel nat jo jackie andy lou kit val
  kris harley rana sami linh thao wei jun yu yan ling hui jing min ren hyun
  jimin jiwoo chihiro hikaru makoto alaa iman michele gabriele daniele sacha
  misha vanya elisha harpreet gurpreet manpreet navdeep jaspreet amandeep
  mandeep hilary laurence nikola chandra madhu ngoc phuong hanh dung nam long
  kym paris kasey leigh alexis kerri kerrie kay kelsey shayne jodi marion lan
  yael ollie robbie rory karan krishna shiva surya ali isa akira keita mattia
  elia jules dima ilya indra arya dharma krisna
`);

const FEMALE = words(`
  mary emma olivia ava sophia sophie sofia isabella isabelle isabel mia
  charlotte amelia harper evelyn abigail abby emily elizabeth ella madison
  maddison scarlett victoria aria grace chloe camila penelope layla lily lilly
  nora zoe zoey hannah hazel violet aurora savannah audrey brooklyn bella claire
  clare lucy paisley natalie anna caroline carolyn genesis leah aaliyah allison
  alison gabriella gabrielle alice sadie hailey hayley eva emilia autumn nevaeh
  piper ruby serenity willow madelyn madeline madeleine kaylee naomi sarah sara
  alexa alexandra stella ellie maya tania tanya jessica jennifer jenny amanda
  stephanie nicole michelle rachel rachael samantha rebecca rebekah katherine
  catherine kathryn kathleen kathy kate katie megan meghan andrea laura lauren
  linda patricia barbara susan suzanne susanne susanna susannah sue suzie susie
  karen nancy betty margaret sandra donna carol carole ruth sharon helen helena
  deborah debra debbie diana diane dianne julia julie juliet juliette bonita
  shanelle alesha elin kenisha raphita nadia nina tara lara adele adeline
  adriana agnes aimee amy alana alanna alicia alisha alyssa amber anastasia
  angela angelica angelina anita ann anne annabel annabelle annette annie april
  ariana arianna ashleigh ashlee beatrice becky belinda bernadette beth bethany
  beverley beverly bianca bridget brianna briony bronte bronwyn brooke caitlin
  caitlyn cara carla carly carmen cassandra cassie cecilia celeste chelsea
  cheryl christina christine cindy clara claudia colleen courtney crystal daisy
  danielle daphne dawn delilah denise dorothy edith eleanor elena elise eliza
  ellen eloise elsie emilie erica erin esther eve evie faith felicity fiona
  florence frances francesca freya gail gemma georgia georgina geraldine gillian
  gina giselle gloria gwen harriet heather heidi holly hope imogen india ingrid
  irene iris isla ivy jacqueline jade jane janet janice jasmine jeanette jemima
  jenna jill jillian joan joanna joanne jocelyn jodie josephine josie joy joyce
  judith judy julianne june justine kara karina karla katelyn katrina kayla
  keira kelly kiara kimberley kimberly kirsten kirsty kristen kristin kristina
  kylie lacey lana leanne leila lena leonie libby lila lillian lisa lola
  lorraine louisa louise lucia lucinda luna lydia lynette lynn maggie mandy
  marcia margot maria marian marie marilyn marina marissa martha matilda maureen
  meg melanie melinda melissa meredith mikayla mila millie miranda miriam molly
  monica monique nadine natasha natalia nell nicola nikki noelle olive paige
  pamela paula pauline penny philippa phoebe pippa poppy priscilla renee
  rhiannon rita roberta robyn rochelle rosa rosalie rose rosemary rosie roxanne
  sabrina sally sheila shelley sherry shirley sienna simone skye sonia sonya
  stacey summer sylvia tahlia talia tamara tammy tayla teagan tegan teresa
  theresa tess tessa tiffany tina toni tracey tracy trinity valerie vanessa vera
  veronica vicki vicky virginia vivian vivienne wendy whitney yasmin yvette
  yvonne zara billie dani mei yuna hana sakura aiko akiko emi emiko haruka hina
  kaori keiko kyoko mai mariko miho miki misaki miyu momoka nanami naoko natsuki
  noriko rina sachiko saki sayaka tomoko yoko yui yuka yukiko yumi yumiko ayaka
  ayumi asuka seoyeon minji soyeon eunji hyejin jiyeon sujin yejin thuy trang
  huong nhung priya aisha ananya anjali aditi deepika divya isha kavya lakshmi
  meera neha nisha pooja priyanka riya sana shreya sneha sunita swati tanvi
  anika anushka aarti asha geeta jyoti kavita komal manisha meena nandini neelam
  pallavi payal radha rani rekha ritu sakshi sangeeta sarita seema shilpa shruti
  simran sonali trisha uma vandana vidya fatima amina amira mariam maryam rania
  salma samira zahra zainab zeynep huda khadija lina maha mona reem shirin
  soraya yara farah dalia dina hala jamila giulia chiara martina alessia
  valentina federica ilaria paola silvia simona camille lea manon ines margaux
  amelie oceane mathilde elodie celine aurelie anais hanna johanna katharina
  sabine petra ursula greta astrid freja saga elsa maja linnea ebba annika
  katarzyna agnieszka malgorzata magdalena ewa olga tatiana svetlana irina
  ekaterina yulia daria polina oksana ana pilar dolores beatriz catalina
  gabriela daniela fernanda mariana valeria ximena eleni ioanna abbey alyce
  britney brittany brittney candice carmel charlee charli desley ebony gayle
  jasmin kaylene keely kelli kellie kristy krystal krystle maree marnie renae
  sharyn sheryl taylah terri therese tia tori trudy
`);

const MALE = words(`
  james robert john michael david william richard joseph thomas charles
  christopher daniel matthew mathew anthony mark donald steven stephen paul
  andrew joshua kenneth kevin brian bryan george timothy ronald edward jason
  jeffrey ryan jacob gary nicholas eric jonathan larry justin scott brandon
  benjamin samuel raymond gregory frank alexander patrick jack dennis jerry
  tyler aaron jose adam nathan henry peter zachary douglas harold kyle noah
  ethan liam mason logan aiden aidan jackson sebastian owen caleb luke isaac
  dylan connor harrison theodore derek ayush anderson alan allan albert alfie
  alistair angus archer archie arthur ashton austin barry beau ben blake bob
  bobby billy bradley brad brendan brent brett brodie bruce byron callum cameron
  carl chad christian clayton clint clive cody colin cooper corey craig curtis
  dale damian damien danny darren darryl dave dean declan dominic don doug
  duncan dustin dwayne eddie edwin eli elijah elliot elliott evan ewan felix
  finn fletcher flynn francis fraser fred frederick gabriel gareth gavin geoff
  geoffrey gerald gerard glen glenn gordon graeme graham grant greg gus hamish
  harry harvey hayden heath hudson hugh hugo hunter ian ivan jai jake jared
  jarrod jasper jay jayden jed jeff jeremy jim jimmy joe joel johnny jon jonah
  josh julian keith kelvin ken kent kieran kurt lachlan lance lawrence leo leon
  leonard levi lewis lincoln lloyd louis lucas luca luka malcolm marcus mario
  martin marty marvin matt max maxwell mitchell mitch murray nate nathaniel neil
  nelson neville nick nigel noel norman oliver oscar otis otto percy perry phil
  philip phillip pierce preston ralph randall ray reece reuben rex rhys ricky
  rob rod rodney roger roland roman ron ross roy russell saxon sean shane shaun
  shawn sid simon spencer stan stanley steve stewart stuart ted theo tim toby
  todd tom tommy tony travis trent trevor tristan troy vaughn victor vincent
  wade walter warren wayne wesley will xavier zac zach zack zane ezra nikhil dev
  rohan arjun aarav aditya ajay akash amit anand anil ankit arun ashok deepak
  dhruv gaurav harsh ishaan kunal manish mohit naveen nitin pranav prakash rahul
  raj rajesh rakesh ram ravi rishi rohit sachin sahil sanjay siddharth sunil
  suresh varun vijay vikram vinay vishal vivek yash abhishek aryan ayaan kabir
  kartik lakshman mahesh manoj mukesh neeraj pankaj rajan rajiv ramesh sandeep
  shiv tarun tushar uday harsha chaitanya venkata srinivasa narayana mahendra
  narendra rajendra surendra jitendra ravindra mohammed muhammad mohammad
  mohamed ahmed ahmad omar umar hassan hasan hussein husain ibrahim khalid
  mahmoud mustafa yusuf youssef abdullah abdul hamza bilal tariq karim kareem
  samir faisal fahad saeed said salman imran irfan zain zayd amir reza mehdi
  arash dariush kian emre mehmet murat burak musa yahya taha osama usama zakaria
  zakariya hiroshi takashi kenji kenta haruto daiki sota yuto riku takumi shota
  kazuki naoki ryo ryota satoshi taro tatsuya yusuke daisuke takuya kazuya
  shinya tetsuya naoya tomoya yuya yuta minjun seojun jihoon joon sungmin
  jaehyun donghyun minh duc hung tuan quang hieu khoa marco matteo lorenzo
  alessandro francesco giovanni giuseppe antonio paolo pierre antoine julien
  nicolas olivier guillaume hans klaus jurgen stefan wolfgang lukas jonas
  maximilian moritz lars sven erik bjorn anders magnus henrik johan nils piotr
  pawel krzysztof tomasz marek jakub andrzej dmitri dmitry sergei alexei
  vladimir igor mikhail nikolai pavel carlos juan luis miguel javier diego pedro
  pablo alejandro fernando jorge manuel rafael ricardo santiago mateo sergio
  dimitri giorgos nikos kostas yehuda tevita sione viliami semisi adrian brady
  brayden brendon brock brody bryce chase damon dane darrin daryl desmond garry
  jett jonathon kaleb kane karl kye lochlan micheal seth taj terence terrence
  tyrone devendra upendra dharmendra yogendra virendra bhupendra gajendra
  nagendra harendra putra bima
`);

// Endings, for a name on none of the lists. Each was tried on 39,635 rarer names in the US
// data that the big list leaves out, and only those right at least 95% of the time were kept
// (-a 96.9%, -ette 97.9%, -anne 97.8%, -ard 96.7%, -ert and -ew 100%). Dropped: -elle, -lyn,
// -een, -ine, -son, -ton, -old. The -a rule is the weak point for men's names from India,
// Indonesia and Japan that the lists don't hold.
const FEMALE_ENDINGS = ['a', 'ette', 'anne'];
const MALE_ENDINGS = ['ard', 'ert', 'ew'];

/** Where a name sits on the lists: 'f', 'm', 'u' (on a list as anyone's name), or null (on no list). */
function lookUp(name) {
  if (!name) return null;
  if (EITHER.has(name)) return 'u';
  if (FEMALE.has(name)) return 'f';
  if (MALE.has(name)) return 'm';
  const d = data();
  if (d.f.has(name)) return 'f';
  if (d.m.has(name)) return 'm';
  if (d.either.has(name)) return 'u';
  return null;
}

/**
 * Guess whether a first name usually belongs to a woman ('f') or a man ('m').
 * Returns 'u' when it can't tell, which is often.
 */
export function guessNameGender(firstName) {
  if (!firstName) return 'u';
  const plain = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // José -> Jose
    .toLowerCase().replace(/[^a-z]/g, '');
  const first = String(firstName).trim().split(/\s+/)[0];
  const joined = plain(first);                    // Jo-Anne -> joanne
  const name = plain(first.split('-')[0]);        // Mary-Jane -> mary
  if (!name) return 'u';

  const found = (joined !== name ? lookUp(joined) : null) || lookUp(name);
  if (found) return found;

  // On no list: a weak guess from the ending.
  if (name.length > 3) {
    if (FEMALE_ENDINGS.some(e => name.endsWith(e))) return 'f';
    if (MALE_ENDINGS.some(e => name.endsWith(e))) return 'm';
  }
  return 'u';
}

/** The same guess for a student: the name they go by first, then the one on the class list. */
export function guessStudentGender(student) {
  if (!student) return 'u';
  for (const name of [student.goesBy, student.preferredName]) {
    const guess = guessNameGender(name);
    if (guess !== 'u') return guess;
  }
  return 'u';
}

function shuffled(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Choose the wrong answers to sit beside `correct`.
 *
 * `first` is the people this one has already been mixed up with, most often
 * first. They take the first places: nothing makes a better wrong answer
 * than a name you have actually given for this face.
 *
 * The rest are chosen by name. When the right name can be placed: names of
 * the same likely gender first, then names that can't be placed, and names of
 * the other gender only when there is nothing else. When it can't be placed:
 * anyone in the class.
 */
export function chooseDistractors(correct, others, count = 3, rand = Math.random, first = []) {
  const pool = shuffled(others, rand);
  if (!correct || pool.length <= count) return pool;

  const lead = first.filter(s => pool.includes(s)).slice(0, count);
  if (lead.length === count) return lead;
  const rest = pool.filter(s => !lead.includes(s));
  const need = count - lead.length;

  const target = guessStudentGender(correct);
  if (target === 'u') return [...lead, ...rest.slice(0, need)];

  const rank = (s) => {
    const guess = guessStudentGender(s);
    return guess === target ? 0 : guess === 'u' ? 1 : 2;
  };
  // The sort is stable, so the shuffle survives within each rank.
  const byName = rest
    .map(s => ({ s, r: rank(s) }))
    .sort((x, y) => x.r - y.r)
    .slice(0, need)
    .map(x => x.s);
  return [...lead, ...byName];
}
