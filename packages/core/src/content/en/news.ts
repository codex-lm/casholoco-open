import type { NewsText } from './types';
import { EN_EXTRA_NEWS, EN_EXTRA_RUMORS } from './extra';

/**
 * The Daily Capital: English texts of the news cards, keyed by NewsCard.id.
 * Effects, weights and turn bounds come from ../fr/news.ts. Headlines keep exactly the
 * same placeholders as the French card; bodies and rumors never have any.
 */
const EN_BASE_NEWS: Record<string, NewsText> = {
  // ---------------------------------------------------------------------------
  // Commodities
  // ---------------------------------------------------------------------------
  lithium_influencer: {
    headline: 'Wellness influencer declares lithium “bad for your energy”',
    body: 'Her 12 million followers are boycotting batteries. Lithium prices crash, and so do e-scooter sales.',
    rumor: 'A famous lifestyle influencer is said to be filming a “shocking” video about rare metals.',
  },
  oil_cartel_cut: {
    headline: 'Oil cartel slashes output “purely out of kindness”',
    body: 'The ministers swear they want to “protect the planet.” Mostly, they are protecting their margins, and they plan to keep at it for several quarters.',
    rumor: 'Oil ministers have reportedly booked an entire palace for a “reflection weekend.”',
  },
  oil_tanker_glut: {
    headline: 'Supertanker docks at the wrong port, dumps its whole cargo at fire-sale prices',
    body: 'The captain refuses to turn around “as a matter of principle.” The market is flooded with cut-rate crude.',
  },
  oil_remote_work: {
    headline: 'Remote work goes universal: nobody leaves the house, oil gets the blues',
    body: 'Highways are empty, slippers are full. Refineries are looking into a pivot to hot cocoa.',
    rumor: 'Several blue-chip employers are reportedly preparing a joint statement on “working from the couch.”',
  },
  sugar_record_harvest: {
    headline: 'Record beet harvest: silos overflow into high-school gyms',
    body: 'Farmers have run out of places to put the sugar. One mayor proposes paving the roads with it.',
    rumor: 'Sugar beet farmers were reportedly seen smiling, which hasn’t happened since 1987.',
  },
  sugar_locusts: {
    headline: 'Vegan locusts ravage the world’s sugarcane fields',
    body: 'The insects touch nothing else, “on principle.” Candy makers are in mourning and energy drink brands are sweating.',
  },
  sugar_chef_trend: {
    headline: 'Celebrity chefs put sugar in everything, including the salt',
    body: '“Glycemic gastronomy” is all the rage. Sugar is flying off the shelves and dentists are shopping for yachts.',
  },
  chips_foundry_fire: {
    headline: 'Fire at the world’s biggest chip foundry: an intern plugged in a kettle',
    body: 'Global microchip output will be hit for several quarters. The kettle, on the other hand, works perfectly.',
    rumor: 'A major chip foundry allegedly unplugged its smoke detectors “to save on batteries.”',
  },
  chips_glut: {
    headline: 'Chip glut: microchips now come free in cereal boxes',
    body: 'Manufacturers got a little too ambitious. Kids are finding processors at the bottom of the box and prices are in free fall.',
  },
  lithium_shepherd_mine: {
    headline: 'Shepherd finds lithium deposit under his barn',
    body: 'The sheep have been relocated to an open-plan office. Global lithium supply jumps for many months to come.',
    rumor: 'Geologists were reportedly spotted digging in a sheep barn. The sheep declined to comment.',
  },
  lithium_salt_lake: {
    headline: 'The giant salt lake that supplied all the lithium has evaporated',
    body: 'Experts cite global warming, overpumping and “a bit of bad luck.” Battery makers are in full panic mode.',
    rumor: 'Water levels at a major salt lake are said to be seriously worrying metals traders.',
  },
  commodity_hedge_fund_hoard: {
    headline: '{commodity}: hedge fund corners the entire world supply “just to see what happens”',
    body: 'The fund manager says he “had a gut feeling in the shower.” Manufacturers are left holding nothing but the bill.',
    rumor: 'A hedge fund has reportedly leased some gigantic warehouses. To store what, nobody knows.',
  },
  commodity_fat_finger: {
    headline: 'Flash crash in the {commodity} market: a third of its value wiped out by a typo',
    body: 'A trader typed one zero too many, then added another “for symmetry.” Buyers are rubbing their hands.',
  },
  commodity_parking_deposit: {
    headline: '{commodity}: huge deposit discovered under a shopping mall parking lot',
    body: 'Shoppers will have to park a little farther away for a few years. Prices, meanwhile, will stay relaxed for a good while.',
    rumor: 'Drilling rigs were reportedly spotted in a mall parking lot, between the shopping carts.',
  },
  commodity_empty_reserves: {
    headline: '{commodity}: the government’s strategic reserves have been empty for years',
    body: 'A civil servant finally opened the warehouse. Inside: one bicycle and a 1998 calendar. Markets are freaking out.',
  },
  dockers_strike: {
    headline: 'Nationwide dockworkers’ strike: nothing leaves the ports, not even the dockworkers',
    body: 'Containers of chips and lithium pile up on the docks. Talks will resume “after the nap.”',
    rumor: 'Port unions have reportedly ordered protest banners in bulk.',
  },

  // ---------------------------------------------------------------------------
  // Sectors
  // ---------------------------------------------------------------------------
  energy_drinks_olympics: {
    headline: 'Can-opening becomes an Olympic sport',
    body: 'Athletes are training their wrists. Energy drinks become official equipment and sales take off.',
    rumor: 'The International Games Committee is said to be considering “inclusive, carbonated disciplines.”',
  },
  energy_drinks_heart_study: {
    headline: 'Study links energy drinks to heart palpitations: consumers lose sleep over it',
    body: 'Researchers recommend “fewer than twelve a day.” Sales slow down and cardiologists start hiring.',
  },
  energy_drinks_heatwave: {
    headline: 'Record heat wave: cold cans fly off the shelves, yogurts go sour',
    body: 'Supermarkets are rationing cold drinks. Over in the dairy aisle, on the other hand, the yogurts are looking grim.',
  },
  gadgets_black_friday: {
    headline: 'Black Friday never ends: smart gadgets sell like smart hotcakes',
    body: 'Shoppers are buying toothbrushes with facial recognition. Nobody knows why, and everybody wants two.',
  },
  gadgets_grandparents: {
    headline: 'Grandparents discover smart gadgets and gift them to the whole family',
    body: 'Grandma bought three smart speakers “because at least they answer back.” The sector is ecstatic.',
    rumor: 'Senior centers are reportedly hosting “tablets and talking objects” workshops.',
  },
  gadgets_digital_detox: {
    headline: '“Digital detox” craze: teens are throwing their gadgets into lakes',
    body: 'Influencers explain on social media why everyone should quit social media. Gadget sales sink, and so do the gadgets.',
  },
  gadgets_factory_strike: {
    headline: 'Strike at the gadget plants: workers want a smart fridge too',
    body: 'Talks have stalled over which fridge model. Meanwhile, labor in the sector costs a whole lot more.',
  },
  scooters_transport_strike: {
    headline: 'Total transit strike: the e-scooter becomes the only way to get to work',
    body: 'Middle managers discover the headwind. E-scooter inventories vanish in a matter of days.',
  },
  yogurts_butter_shortage: {
    headline: 'Butter shortage: the whole country switches to yogurt, even on pancakes',
    body: 'Diners are improvising. Yogurt sales soar and the cows are demanding a raise.',
    rumor: 'Butter shelves are said to be oddly empty at several supermarket chains.',
  },
  yogurts_immortality_study: {
    headline: 'Dairy-funded study proves yogurt makes you immortal',
    body: 'The sample consisted of eleven people, all of whom were alive at the time of the study. Sales are taking off.',
  },
  yogurts_cow_burnout: {
    headline: 'Dairy cows hit burnout, demand a four-day week',
    body: 'Farmers cave after a nationwide mooing strike. Labor at the dairies gets considerably more expensive.',
    rumor: 'Several cows were reportedly seen chewing their cud with a very militant look.',
  },
  crypto_to_the_moon: {
    headline: 'Crypto goes to the moon: cab drivers are now handing out investment advice',
    body: 'Even your uncle bought a penguin NFT. Analysts are calling it “rational exuberance.”',
    rumor: 'A mysterious anonymous account is promising “an announcement that changes everything” for crypto.',
  },
  crypto_winter: {
    headline: 'Crypto winter: monkey NFTs are now worth less than actual monkeys',
    body: 'Wallets are melting and the “diamond hands” crowd has discovered its paper hands. The whole sector goes into hibernation.',
    rumor: 'The big crypto whales have reportedly been quietly emptying their wallets for days.',
  },
  crypto_micro_state: {
    headline: 'Tiny island nation adopts NFTs as legal tender, pays civil servants in pixels',
    body: 'The finance minister is an animated cat. Global crypto mania roars back to life.',
  },
  crypto_bubble_fomo: {
    headline: 'Crypto fever: the line to buy a token now wraps around the block',
    body: 'People who can’t explain what a token is want three. Analysts have rebranded the fear of missing out as an “investment thesis.”',
    rumor: 'An influencer has reportedly chartered a jet to announce “something huge” about crypto.',
  },
  crypto_bubble_grandmas: {
    headline: 'Grandmas are now mining crypto between knitting rows',
    body: 'The bridge club voted unanimously for a “diversified portfolio”: three tokens and a cat NFT. Demand is running hot.',
    rumor: 'Retirement clubs are said to be taking a very close look at digital wallets.',
  },
  crypto_bubble_metaverse: {
    headline: 'Virtual plot sells for more than a real one: crypto has no ceiling left',
    body: 'The buyer plans to build “a vacation home made of pixels” there. Tokens are flying off the shelves, and prices are following.',
    rumor: 'A record sale of virtual land is reportedly being arranged in total secrecy.',
  },
  crypto_crash_founders: {
    headline: 'Crypto crash: the founders of a star token have left with the cash and the logo',
    body: 'The website now shows a beach photo. The whole sector tumbles as buyers learn that “decentralized” meant “unreachable.”',
    rumor: 'The founders of a star token have reportedly booked one-way tickets.',
  },
  crypto_crash_exchange: {
    headline: 'Crypto crash: the biggest exchange shuts down for “emotional maintenance”',
    body: 'Withdrawals are frozen and customer support only answers in emojis. Demand collapses across the sector.',
    rumor: 'A major crypto exchange is reportedly struggling to process withdrawals.',
  },
  crypto_crash_regulator: {
    headline: 'Crypto crash: a regulator read the white paper all the way to the end',
    body: 'Page 47 said “this is not a promise.” Panic everywhere: tokens nosedive and the bubble goes pop.',
    rumor: 'A regulator has reportedly asked for a translation of a star token’s white paper.',
  },
  sector_viral_trend: {
    headline: '{sector}: the latest teen obsession on social media',
    body: 'One fifteen-second video was all it took. Parents don’t get it, and sales are through the roof.',
    rumor: 'A viral trend is said to be brewing among teenagers. Nobody knows yet what it will be about.',
  },
  sector_parents_boycott: {
    headline: 'Boycott alert: {sector} targeted by a very angry parents’ group',
    body: 'The group has twelve members and an excellent way with slogans. Consumers are following along, just in case.',
  },

  // ---------------------------------------------------------------------------
  // Macroeconomics
  // ---------------------------------------------------------------------------
  central_bank_hike: {
    headline: 'Central Bank hikes rates to “cool the exuberance”',
    body: 'Borrowing gets pricier and investors sulk. The governor insists “it’s for your own good.”',
    rumor: 'The Central Bank governor was reportedly frowning through an entire state dinner.',
  },
  central_bank_cut: {
    headline: 'Central Bank cuts rates: money is now free, except for savers',
    body: 'Companies borrow with gusto. Savings accounts now yield less than a mason jar.',
    rumor: 'A Central Bank board member reportedly described current rates as “a bit steep.”',
  },
  quantitative_easing: {
    headline: 'Central Bank prints money on an “exceptional, unlimited and permanent basis”',
    body: 'The presses run day and night. Stuffed with liquidity, the markets don’t know what to buy, so they buy everything.',
  },
  recession: {
    headline: 'Recession! Economists, who all saw it coming in hindsight, sound the alarm',
    body: 'Households put off non-essential purchases, meaning almost everything you sell. The stock market has a nasty cough.',
    rumor: 'Several prominent economists have reportedly canceled their vacations “as a precaution.”',
  },
  bank_crisis: {
    headline: 'A “too big to fail” bank puts the theory to the test, live',
    body: 'Other banks turn off the credit tap. Rates climb and the stock market goes weak at the knees.',
    rumor: 'A major bank has reportedly taken its own logo off its headquarters, very discreetly.',
  },
  market_euphoria: {
    headline: 'Market euphoria: analysts recommend buying “everything, right now, on margin”',
    body: 'Trading apps are crashing under the load. Even the most cautious analysts have replaced “caution” with “rocket emoji” in their notes.',
    rumor: 'Several fund managers were reportedly seen ordering chocolate rockets in bulk.',
  },
  flash_crash: {
    headline: 'Flash crash: an algorithm mistakes “sell” for “sell everything”; {company} takes the hit',
    body: 'In three minutes, the biggest company on the board lost its footing. The algorithm has been fired, with no golden parachute.',
  },
  wage_inflation: {
    headline: 'Runaway inflation: workers demand enough money to buy your products',
    body: 'The unions ran the numbers and you won’t like them. Labor costs are rising in every sector.',
    rumor: 'Unions are said to have dusted off their calculators and their megaphones.',
  },
  mystery_billionaire: {
    headline: 'Mystery billionaire announces plans to invest in “literally everything”',
    body: 'He won’t give his name but promises to “buy it all, especially the rest.” Markets catch fire.',
  },
  stimulus_checks: {
    headline: 'Stimulus checks: the government hands out cash, households buy e-scooters',
    body: 'Every household gets a check and immediately spends it on gadgets, electric rides and canned energy.',
    rumor: 'The Treasury is reportedly printing checks on an industrial scale.',
  },

  // ---------------------------------------------------------------------------
  // Politics
  // ---------------------------------------------------------------------------
  exceptional_permanent_tax: {
    headline: 'Government unveils the “Temporary Permanent Surcharge”',
    body: 'The corporate tax rate goes up “for a few quarters, maybe more, almost certainly more.”',
    rumor: 'The budget director was reportedly caught reading corporate balance sheets with visible appetite.',
  },
  competitiveness_shock: {
    headline: 'Pro-business tax cut: corporate taxes drop, dividends give a standing ovation',
    body: 'The government promises the savings will be reinvested. Shareholders have already booked their vacations.',
    rumor: 'A quiet amendment is said to be circulating in the finance committee, late at night.',
  },
  tax_amnesty: {
    headline: 'Tax amnesty: “Declare your island and we’ll say no more”',
    body: 'For one quarter, corporate tax is lighter. Tax havens report a strange dip in foot traffic.',
  },
  budget_hole: {
    headline: 'Budget black hole: the missing billions turn up… in your pocket',
    body: 'The deficit is “deeper than expected.” Businesses are kindly asked to chip in more, temporarily of course.',
    rumor: 'Government auditors have reportedly requested a calculator with more digits.',
  },
  dormant_cash_tax: {
    headline: 'Emergency tax on “idle” corporate cash: companies jolted awake',
    body: 'The state skims a small percentage off every cash pile. “It wasn’t doing anything anyway,” the minister explains.',
  },
  unicorn_nation_subsidy: {
    headline: '“Unicorn Nation” plan: one grant per company, no questions asked',
    body: 'The application fits on a postage stamp and the “project” box is optional. Only companies run by a flesh-and-blood boss (more or less) qualify.',
    rumor: 'The Commerce Department is reportedly looking to “spread the love” before the elections.',
  },
  soda_tax: {
    headline: 'Soda tax: sugary drinks taxed in the name of public health, and of the deficit',
    body: 'The government swears it has nothing to do with the budget. Energy drink sales take a nosedive.',
    rumor: 'Several lawmakers reportedly turned down a sugary cocktail at a reception. Bad sign for soda.',
  },
  scooters_city_ban: {
    headline: 'The capital bans e-scooters from sidewalks, streets and line of sight',
    body: 'The mayor promises a “calmer city.” E-scooter makers are considering a pivot to wheelbarrows.',
    rumor: 'The capital’s city council is said to be drafting an “anti-things-on-wheels” ordinance.',
  },
  green_law: {
    headline: '“Planet First” Act: green rebate for every e-scooter',
    body: 'Each buyer gets a rebate and an “I’m Saving the World” bumper sticker. Lithium, however, is starting to run short.',
    rumor: 'A “green” bill is reportedly ready, complete with rebates for electric rides.',
  },
  great_national_cause: {
    headline: 'This year’s Great National Cause: {sector}',
    body: 'The government promises billboards, subsidies and teary speeches. The chosen sector never asked for this much.',
    rumor: 'The government is said to still be undecided on this year’s “Great National Cause.” Lobbyists are lining up.',
  },
  labor_reform: {
    headline: 'Labor reform: the lunch break becomes “optional but encouraged”',
    body: 'Labor costs drop across the board. So does the public image of the bosses, a little.',
    rumor: 'The Labor Department is reportedly preparing a 400-page “simplification” bill.',
  },
  early_elections: {
    headline: 'Snap elections: markets hate uncertainty, except when it pays',
    body: 'Candidates promise everything and its opposite. Lenders, ever cautious, nudge their rates up a notch.',
  },
  tax_audit_richest: {
    headline: 'The taxman takes a very, very close interest in {company}',
    body: 'Tax collectors always start with the biggest fish. Auditors have moved into headquarters with their thermoses, and the bill promises to be steep.',
    rumor: 'Tax auditors have reportedly booked a big company’s boardroom for “several weeks.”',
  },
  bailout_smallest: {
    headline: 'Government rushes to rescue {company}, deemed “too small to fail”',
    body: 'The minister explains that “the little guys deserve taxpayer money too.” Check, handshake and official photo op.',
  },
  windfall_tax: {
    headline: 'Windfall profits: {company} asked to share, politely but firmly',
    body: 'The government has found its poster child: the most profitable company of the quarter. It pays up, and polishes its image in the process.',
    rumor: 'The government is reportedly looking for “an example” among the most profitable companies.',
  },

  // ---------------------------------------------------------------------------
  // Scandals
  // ---------------------------------------------------------------------------
  document_leak: {
    headline: 'Document leak: {company}’s dirty little secrets aired in public',
    body: 'Thousands of internal emails reveal “creative” practices. Management decries “4,000 pages taken out of context.”',
    rumor: 'A whistleblower has reportedly contacted several newsrooms with a very, very heavy USB stick.',
  },
  class_action: {
    headline: 'Class action against {company}: 40,000 plaintiffs and one very motivated lawyer',
    body: 'The most scandal-ridden company on the board agrees to a settlement “with no admission of wrongdoing.” The check, however, is very real.',
  },
  ceo_yacht: {
    headline: 'Leaked photos: {ceo} on a yacht while {company} tightens its belt',
    body: 'The PR team calls it “a floating strategic offsite.” The employees are doing some strategic thinking of their own.',
  },
  regulator_fine: {
    headline: 'Record fine for {company}: the regulator actually read the terms and conditions',
    body: 'A clause in 4-point font allowed the company to do “anything, anytime, anywhere.” The regulator was not amused.',
  },
  fridge_spying: {
    headline: 'Smart fridges were spying on their owners: bug or feature?',
    body: 'Thousands of fridges were sending grocery lists to advertisers. Manufacturers call it a “personalized experience.”',
    rumor: 'A hacker reportedly found something “embarrassing” in smart-fridge firmware.',
  },
  anti_aging_yogurts: {
    headline: 'Influencers paid to hype “anti-aging” yogurts: the investigation nobody wanted',
    body: 'The stars claimed to look twenty years younger. The “before” photos turned out to be from the previous week.',
    rumor: 'An investigative reporter has reportedly followed way too many nutrition accounts.',
  },
  greenwashing_report: {
    headline: 'Report compares green leaves on logos with actual leaves: not the same thing',
    body: 'The nonprofit spent all summer studying packaging. Companies run by ambitious bosses get called out first.',
    rumor: 'A nonprofit reportedly spent the summer comparing corporate logos with real tree leaves.',
  },
  crypto_rug_pull: {
    headline: 'Founder of a “revolutionary” token vanishes with the treasury: the whole sector pays',
    body: 'He left a short note: “Thanks for the ride.” Investors now side-eye every crypto on the market.',
    rumor: 'A high-profile crypto founder has reportedly sold his house and bought a one-way ticket.',
  },
  national_mea_culpa: {
    headline: 'National Apology Day: every CEO says sorry, nobody pays anything back',
    body: 'One minute of silence, three tears and a black-and-white video. A touched public wipes the slate clean.',
  },

  // ---------------------------------------------------------------------------
  // Technology
  // ---------------------------------------------------------------------------
  ai_rebrand: {
    headline: 'Everyone adds “AI” to their name: investors applaud without reading',
    body: 'One manufacturer renamed its desk lamp “AI Lamp” and gained 15% on the stock market. It still turns on with a switch.',
  },
  ai_chip_frenzy: {
    headline: 'Artificial intelligences demand chips, lots of chips',
    body: 'Data centers are gobbling up the entire output. Gadgets ride the hype, but chips are getting scarce.',
    rumor: 'AI giants have reportedly placed chip orders “with a lot of zeros.”',
  },
  battery_breakthrough: {
    headline: 'Breakthrough: a battery that outlasts the e-scooter it powers',
    body: 'It takes half as much lithium per ride. E-scooters are finally more reliable than their riders.',
    rumor: 'A university lab reportedly popped the champagne at 3 a.m.',
  },
  quantum_blockchain: {
    headline: 'Quantum computer cracks the blockchain in four minutes, three of them spent loading',
    body: 'Crypto’s “unbreakable security” lasted less time than a software update. Investors are running for the exits.',
    rumor: 'A lab has reportedly obtained “concerning” results in cryptography. It refuses to say more.',
  },
  firmware_fiasco: {
    headline: 'Botched update turns smart gadgets into paperweights',
    body: 'Version 14.2.7 promised “a smoother experience.” Mostly, it delivered a quieter one.',
  },
  robot_scooter_factories: {
    headline: 'Robots now assemble the e-scooters, and test-ride them too',
    body: 'Assembly lines run with no breaks and no coffee. The cost of building e-scooters collapses.',
  },
  printed_yogurt: {
    headline: '3D-printed yogurt: cows fear for their jobs',
    body: 'One printer turns out 400 cups an hour and never asks for pasture. Dairies slash their production costs.',
    rumor: 'A dairy has reportedly ordered a printer “the size of a barn.”',
  },
  intern_breakthrough: {
    headline: 'Stroke of genius at {company}: intern invents a thing nobody gets and everyone wants',
    body: 'The intern was rewarded with a second internship. The stock soars and the brand is glowing.',
  },

  // ---------------------------------------------------------------------------
  // Absurd
  // ---------------------------------------------------------------------------
  ufo_energy_drinks: {
    headline: 'UFO lands, stocks up on energy drinks and takes off again',
    body: 'The aliens paid contactless. Can sales skyrocket and the stock market gets its smile back.',
    rumor: 'Strange lights were reportedly seen hovering over a canning plant.',
  },
  mercury_retrograde: {
    headline: 'Mercury in retrograde: investors dump everything on their astrologer’s advice',
    body: 'Trading floors have swapped their screens for crystal balls. Prices fall, psychics cash in.',
    rumor: 'Financial astrologers are said to be forecasting an alignment “very unfavorable to equities.”',
  },
  mascot_meme: {
    headline: '{company}’s mascot becomes a global meme',
    body: 'A video of the mascot tumbling down a staircase went around the world. Against all odds, everyone loves the brand.',
  },
  ceo_marathon: {
    headline: '{ceo} runs a marathon in a three-piece suit to reassure shareholders',
    body: 'Dead last at the finish, but in a tie. The press hails “a boss who never gives up” and forgets about the pending lawsuits.',
  },
  ceo_podcast: {
    headline: '{ceo} launches a six-hour podcast on “discipline”: {company} stock wobbles',
    body: 'Listeners lasted four minutes on average. Investors wonder who runs the company during the recordings.',
  },
  couch_million: {
    headline: '{company} finds a million dollars under a couch at headquarters',
    body: 'Accounting calls it “a very well-rounded rounding error.” The money goes back into the treasury, no questions asked.',
  },
  sugar_free_cult: {
    headline: 'The “zero sugar” diet becomes a religion, complete with priests and sins',
    body: 'Followers are throwing their cans into the sea. Sugar tumbles, and energy drinks and sweetened yogurts go down with it.',
    rumor: 'A wellness guru is reportedly writing a book titled “Sugar: The Devil in Your Pantry.”',
  },
  cat_coin: {
    headline: 'Cat walks across a keyboard, creates the quarter’s best-performing cryptocurrency',
    body: 'MeowCoin gained 4,000% overnight. The cat is declining all interviews but will accept treats.',
  },
  small_caps_darling: {
    headline: 'Retail investors fall head over heels for {company}, “the gem nobody saw coming”',
    body: 'An online forum has decreed that the smallest company on the board is “going to the moon.” Nobody checked.',
    rumor: 'A retail-investor forum is reportedly hunting for “the next gem” among the smallest stocks.',
  },
};

/** Fake but plausible rumors, keyed by FakeRumor.id. */
const EN_BASE_FAKE_RUMORS: Record<string, string> = {
  fake_crypto_crash_founders: 'A star crypto team has reportedly emptied its office, taking the computers and the coffee machine.',
  fake_crypto_crash_exchange: 'A major crypto platform has reportedly asked customers to wait “just a few weeks” before withdrawing their funds.',
  fake_crypto_crash_regulator: 'Inspectors are reportedly preparing a blanket shutdown of crypto platforms after reading their fine print.',
  fake_sugar_ban: 'The government is reportedly considering a ban on sugar on Sundays.',
  fake_rate_cut: 'The Central Bank is said to be about to cut rates much faster than expected.',
  fake_rate_hike: 'A surprise rate hike is reportedly on the table to “cool down” the markets.',
  fake_oil_embargo: 'Several oil-producing countries are said to be preparing a surprise embargo.',
  fake_chips_dump: 'Entire warehouses of unsold microchips are reportedly about to be dumped at fire-sale prices.',
  fake_scooter_bonus: 'An e-scooter purchase rebate is said to have been slipped into the next budget.',
  fake_yogurt_recall: 'A massive yogurt recall is reportedly imminent after reports of “an unexpected flavor.”',
  fake_nft_ban: 'Regulators are said to be about to ban NFTs outright.',
  fake_pension_crypto: 'A major pension fund will reportedly move its members’ retirement savings into crypto.',
  fake_energy_schools: 'Energy drinks are said to be about to become the official beverage of school cafeterias.',
  fake_gadget_explosion: 'A hugely popular smart gadget reportedly explodes “occasionally” while charging. Recall imminent?',
  fake_tax_cut: 'The budget director is said to be privately promising a massive corporate tax cut.',
  fake_indecent_profits: 'A tax on “obscene profits” will reportedly be passed as early as next quarter.',
  fake_foreign_raid: 'A foreign fund is said to be preparing a giant takeover bid for the biggest company on the board.',
  fake_big_investigation: 'A bombshell investigation is reportedly targeting a “very high-profile” listed company. The lawyers are already on edge.',
  fake_beet_disease: 'A mysterious disease is said to be hitting sugar beets. Sugar prices could skyrocket.',
  fake_lithium_mine: 'A giant lithium mine is reportedly starting production as early as next month.',
  fake_general_strike: 'A general strike notice has reportedly been filed for the entire next quarter.',
  fake_ai_bubble: 'Analysts are whispering that the AI bubble will burst “any day now.”',
  fake_whale_investor: 'A low-profile billionaire is said to be about to pour billions into the stock market “for fun.”',
  fake_paid_leave: 'The government is reportedly preparing to abolish paid vacation “on a trial basis.”',
  fake_hottest_summer: 'Meteorologists are said to be predicting the hottest summer in history. At least.',
  fake_cow_strike: 'Dairy cows are reportedly planning an open-ended milk strike.',
  fake_chips_shortage: 'A major chipmaker is said to be announcing a global chip shortage “in the coming days.”',
};

export const EN_NEWS: Record<string, NewsText> = { ...EN_BASE_NEWS, ...EN_EXTRA_NEWS };

export const EN_FAKE_RUMORS: Record<string, string> = { ...EN_BASE_FAKE_RUMORS, ...EN_EXTRA_RUMORS };
