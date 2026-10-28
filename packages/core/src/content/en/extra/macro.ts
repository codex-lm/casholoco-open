import type { NewsText } from '../types';

/** Batch “macro”: English texts for ../../fr/extra/macro.ts, keyed by the same ids. */
export const EN_NEWS_MACRO: Record<string, NewsText> = {
  // Central Bank and rates
  mc_rate_hike_show_of_hands: {
    headline: 'Central Bank raises rates by show of hands; the chairman raised both',
    body: 'Borrowing gets pricier for a year. The minutes describe the decision as “unanimous, minus one.”',
    rumor: 'The Central Bank chairman was reportedly seen stretching his arms before the policy meeting.',
  },
  mc_rate_cut_no_promises: {
    headline: 'Central Bank cuts rates and pledges to “commit to nothing” for two years',
    body: 'Credit gets cheap. Economists spend the night decoding the word “eventually” in the press release.',
    rumor: 'The Central Bank’s next statement was reportedly run past a poet “to soften the tone.”',
  },
  mc_rate_lottery: {
    headline: 'Interest rates will now be drawn live during the Saturday-night lottery',
    body: 'First draw: rates up for two quarters. The chairman, relieved, will never have to justify anything again.',
    rumor: 'A giant bingo cage was reportedly delivered to Central Bank headquarters.',
  },
  mc_rate_decision_postponed: {
    headline: 'Central Bank postpones rate decision: the boardroom was booked for a retirement party',
    body: 'With no decision, markets waver between panic and pigs in a blanket. They go with a bit of both.',
    rumor: 'Invitations to a Central Bank farewell happy hour have reportedly been circulating for weeks.',
  },
  mc_rate_decimal_slip: {
    headline: 'Central Bank hikes rates just to prove it can still surprise anyone',
    body: 'The chairman was tired of hearing he was “fully priced in.” Credit gets a lot more expensive for two quarters; he has never looked happier.',
  },
  mc_helicopter_money: {
    headline: 'Central Bank tries “helicopter money”: the helicopter is leased, and so is the money',
    body: 'Bills rain down on Main Streets everywhere. Households scoop them up and rush out to buy gadgets, energy drinks and tokens.',
  },
  mc_central_bank_digital_currency: {
    headline: 'Central Bank launches its own digital dollar: “Like crypto, but with paperwork”',
    body: 'Boring, stable and refundable: everything token fans hate. They dump their coins in droves.',
    rumor: 'Central Bank IT staffers were reportedly spotted wearing “to the moon” T-shirts.',
  },

  // Inflation, statistics and market mood
  mc_inflation_new_thermometer: {
    headline: 'Inflation: the Statistics Bureau buys a new thermometer, and the fever breaks instantly',
    body: 'The new index leaves out “anything that goes up.” Official inflation is zero, and the Central Bank loosens its grip.',
  },
  mc_inflation_counter_reports: {
    headline: 'Inflation: the report says 2%, the rebuttal says 9%, the rebuttal to the rebuttal is running late',
    body: 'When in doubt, unions go with the biggest number and wages follow. The stock market holds its breath.',
  },
  mc_commission_on_commissions: {
    headline: 'Government forms a blue-ribbon commission to assess the usefulness of commissions',
    body: 'Its first finding, in 900 pages: a subcommittee is needed. Relieved that nothing will change, markets inch up.',
    rumor: 'A federal agency has reportedly booked a conference room “for an indefinite period.”',
  },
  mc_unemployment_redefined: {
    headline: 'Unemployment cut in half after the Labor Department redefines the verb “to look”',
    body: 'The numbers look gorgeous and the stock market cheers. The unemployed are still looking, just not officially.',
    rumor: 'The Statistics Bureau has reportedly hired a lexicographer to “clarify certain terms.”',
  },
  mc_ministry_of_optimism: {
    headline: 'New Department of Optimism: stock indexes will now be published with a smiley face',
    body: 'Touched by the gesture, investors buy anything that moves. The smiley will be “reassessed next quarter.”',
    rumor: 'A Cabinet shake-up is said to include a “surprise” department with an “upbeat” mission.',
  },
  mc_official_gazette_typo: {
    headline: 'Market panic: the nation’s most respected economist is spotted buying canned goods',
    body: 'He insists it was for a potluck. Investors are dumping everything anyway, pens included.',
  },
  mc_confidence_survey_lottery: {
    headline: 'Consumer confidence hits record high; the survey only polled lottery winners',
    body: 'Shaky methodology, very real effect: convinced all is well, households go shopping. Gadgets and energy drinks cash in.',
  },
  mc_growth_weekends_twice: {
    headline: 'Growth forecast slashed: the Statistics Bureau had been counting weekends twice',
    body: 'Two days of output per week vanish overnight. Investors denounce “a betrayal by arithmetic.”',
  },

  // Labor
  mc_four_day_week_paperwork: {
    headline: 'Four-day workweek becomes law; the fifth day is reserved for filling out the law’s paperwork',
    body: 'Companies pay for five days, get four, plus a day of forms. Labor costs climb across the board.',
    rumor: 'A lawmaker has reportedly filed an amendment to rename Friday “Saturday Jr.”',
  },
  mc_labor_code_one_page: {
    headline: 'Red tape blitz: the labor code slims down from 3,000 pages to 2,999',
    body: 'The missing page apparently held all the good stuff. Hiring gets cheaper and employment lawyers weep quietly.',
  },
  mc_minimum_wage_copy_paste: {
    headline: 'Minimum wage accidentally pegged to Cabinet salaries after a copy-paste error',
    body: 'The order will be fixed “as soon as possible,” meaning in two quarters. Until then, payrolls explode.',
  },
  mc_labor_shortage_form: {
    headline: 'Labor shortage: the government counts available workers with an online form, 40 required fields',
    body: 'The form has scared off every applicant. With hands in short supply, wages rise in every sector.',
    rumor: 'Recruiting firms are reportedly cold-calling retirement homes.',
  },
  mc_scooter_riders_ministers: {
    headline: 'Scooter couriers reclassified as employees, then civil servants, then Cabinet members',
    body: 'The reclassification spun out of control somewhere between two votes on the bill. Scooter operators watch payroll take off.',
  },
  mc_pension_reform_tired: {
    headline: 'Retirement reform sets the age at “whenever you feel tired”; unions ask who gets to decide',
    body: 'Strikes, marches and all-night bargaining sessions: companies pay dearly for labor peace.',
    rumor: 'Unions have reportedly placed an “exceptional” order for picket signs.',
  },
  mc_civil_service_energy_drinks: {
    headline: 'Productivity plan: energy drinks for every civil servant; meetings now last three minutes',
    body: 'Agencies clear a year of backlog in one quarter. The private sector follows suit, and labor costs per file drop everywhere.',
  },

  // Budget and taxes
  mc_self_financing_tax_cut: {
    headline: 'Lawmakers pass a tax cut paid for by “the growth this tax cut will create”',
    body: 'The logic runs in circles, but companies bank the savings. The budget committee chair has asked for a glass of water.',
    rumor: 'The budget committee chair was reportedly seen doodling circles in the margins.',
  },
  mc_missing_zero_deficit: {
    headline: 'Deficit: federal auditors find a zero has been missing from the budget since 2003',
    body: 'To plug the hole, the corporate tax rate goes up “temporarily.” The zero remains at large.',
    rumor: 'Federal auditors have reportedly placed a rush order for new calculators.',
  },
  mc_tax_refund_bug: {
    headline: 'Tax agency refunds every company by mistake, apologizes, asks everyone to keep it quiet',
    body: 'A software update flipped the signs. The Treasury promises to claw the money back “once it finds the password.”',
  },
  mc_crypto_tax_gives_up: {
    headline: 'Crypto gains: the tax agency gives up after failing to understand its own form',
    body: 'Auditors throw in the towel after three years of trying. Token holders celebrate by buying more tokens.',
    rumor: 'A tax auditor has reportedly requested emergency training on “block chains, plural.”',
  },

  // Cycles: recessions, crises and recoveries
  mc_recession_word_banned: {
    headline: 'Government bans the word “recession”; please say “temporary negative growth”',
    body: 'Households, who don’t read executive orders, tighten their belts anyway. Discretionary spending tanks.',
    rumor: 'An agency’s legal team is reportedly drafting a list of “words to avoid.”',
  },
  mc_great_slump: {
    headline: 'Great Slump: the government urges citizens to “visualize growth”',
    body: 'Banks shut off the credit tap, households their wallets. The only growth industry left is report publishing.',
    rumor: 'Several banks have reportedly swapped their ATMs for “Please come back later” signs.',
  },
  mc_stagflation_average: {
    headline: 'Stagflation: prices up, growth down, and the Treasury Secretary insists “one cancels out the other”',
    body: 'Everything costs more and nobody buys anything. The Secretary maintains the average is “perfectly stable.”',
    rumor: 'Treasury aides reportedly spent the weekend revisiting the definition of “average.”',
  },
  mc_credit_crunch_prove: {
    headline: 'Credit crunch: to get a loan, you must now prove you don’t need one',
    body: 'Banks demand three co-signers, two balance sheets and a handwritten cover letter. Borrowing costs soar.',
    rumor: 'Several banks have reportedly deleted the word “yes” from their letter templates.',
  },
  mc_recovery_by_decree: {
    headline: 'Recovery officially declared by executive order, retroactively',
    body: 'Won over by the official seal, households open their wallets again. Economists swear they saw it coming.',
    rumor: 'The Government Printing Office has reportedly received a rush order for “RECOVERY” rubber stamps.',
  },
  mc_soft_landing: {
    headline: 'Soft landing: the economy touches down and the Cabinet claps like tourists on a charter flight',
    body: 'Inflation tamed, jobs intact: the Central Bank eases rates. Passengers are asked to remain seated.',
  },
  mc_bank_stress_test: {
    headline: 'Bank stress tests: every bank passes; the examiner was a bank',
    body: 'Reassured by flawless grades, lenders reopen the credit taps. Nobody checked the answer key.',
    rumor: 'Bank stress test results have reportedly leaked: “Everybody got an A+.”',
  },

  // Industrial policy and commodities
  mc_oil_reserve_two_decrees: {
    headline: 'Strategic oil reserve: one order opens it, another bans it, the first wins on points',
    body: 'Millions of barrels hit the market. The courts have yet to rule on which of the two orders actually exists.',
  },
  mc_lithium_tariff_a_lot: {
    headline: 'Lithium tariffs set at “a lot,” details to follow next quarter',
    body: 'Importers don’t know how much to pay, so they pay plenty. Lithium prices climb.',
    rumor: 'A trade adviser was reportedly seen looking up “lithium” in the dictionary.',
  },
  mc_sugar_price_freeze: {
    headline: 'Sugar price freeze: producers stop producing, and the price thaws immediately',
    body: 'The measure was meant to protect shoppers. Mostly it protects empty warehouses. Sugar prices shoot up.',
    rumor: 'The Treasury Secretary reportedly said the word “freeze” three times in a Cabinet meeting.',
  },
  mc_sovereign_chips_plan: {
    headline: '“Homegrown Chips” plan: the state foundry opens on time and on budget; auditors smell a rat',
    body: 'Nobody in government can remember this ever happening. Chips roll off the line while investigators look for the catch.',
  },
  mc_nutrition_plan_yogurt: {
    headline: 'Federal dietary guidelines now recommend “one yogurt per meal, two if there’s a meeting”',
    body: 'The guidelines were drafted at 12:15 p.m. by a panel that had skipped breakfast. Dairy aisles are cleaned out.',
  },
  mc_scooter_commuter_receipt: {
    headline: 'Commuter benefit: the state reimburses scooters, receipt in triplicate signed by the scooter',
    body: 'Despite the paperwork, workers flock to e-scooters. Operators rub their hands together.',
  },
  mc_strategic_sector_3am: {
    headline: '{sector} declared a “strategic industry” after an amendment filed at 3 a.m.',
    body: 'Nobody remembers voting for it, but it’s now the law of the land. Government contracts pour in.',
    rumor: 'A last-minute amendment was reportedly slipped into the budget under a stack of sandwiches.',
  },
  mc_sector_consume_less_report: {
    headline: '{sector}: a congressional report recommends “thinking about consuming less”',
    body: 'It proposes no actual measures, but households skimmed it and panicked. Sales plunge.',
  },

  // Companies in the government’s sights
  mc_national_champion_decree: {
    headline: '{company} crowned “National Champion” by executive order: its stock soars, rivals choke',
    body: 'The order specifies neither why nor for how long. Investors didn’t ask.',
    rumor: 'A presidential adviser has reportedly had lunch with the same big-company boss three times this week.',
  },
  mc_upsetting_profits_hearing: {
    headline: '{company} hauled before a committee investigating “upsetting profits”',
    body: 'Six hours of testimony, five of them about the carpet color at headquarters. Shareholders get nervous anyway.',
    rumor: 'A congressional committee has reportedly booked a bigger hearing room than usual.',
  },
  mc_startup_grant_wrong_box: {
    headline: '{company} lands a “young startup” grant after someone checked the wrong box',
    body: 'The agency admits the mistake but won’t fix it: “The refund form hasn’t been created yet.”',
  },
  mc_ethics_commission_chair: {
    headline: '{ceo} named chair of the Business Ethics Commission; {company} shares bounce',
    body: 'The government hails “unmatched hands-on experience.” The skeletons in the closet are reclassified as Halloween decor.',
    rumor: 'A headline-grabbing CEO was reportedly spotted in a government hallway carrying a bouquet of flowers.',
  },
};

export const EN_RUMORS_MACRO: Record<string, string> = {
  mc_fake_rate_freeze_decade: 'The Central Bank is said to be pledging not to touch rates “for at least a decade.”',
  mc_fake_dividend_commission: 'A commission will reportedly recommend taxing dividends “at the source, in transit and on arrival.”',
  mc_fake_oil_reserve_refill: 'The government is reportedly about to fill its strategic oil reserve “to the brim.”',
  mc_fake_sugar_rationing: 'A sugar rationing order is said to be sitting in a desk drawer at the Treasury, ready to sign.',
  mc_fake_lithium_nationalized: 'The government is reportedly mulling nationalizing all the lithium in the country, remote-control batteries included.',
  mc_fake_chips_admin_stockpile: 'Federal agencies have reportedly been ordered to stockpile chips “for ten years of photocopiers.”',
  mc_fake_minimum_wage_double: 'The minimum wage will double next quarter, according to a “very advanced” draft order.',
  mc_fake_statisticians_strike: 'Government statisticians are said to be on strike: the next jobs report will be “eyeballed.”',
  mc_fake_deep_recession_report: 'A confidential report reportedly predicts a “deep, long and slightly awkward” recession starting next quarter.',
  mc_fake_governor_resigns: 'The Central Bank chairman has reportedly drafted his resignation letter. He is still looking for a pen.',
  mc_fake_bank_inventory_week: 'Banks will reportedly close for a full week to “take inventory of the vaults.”',
  mc_fake_budget_surplus: 'The federal budget is running a surplus for the first time ever, says a memo nobody is allowed to read.',
  mc_fake_three_day_week: 'Some lawmakers are reportedly pushing a three-day week, “plus a fourth to recover from the first three.”',
  mc_fake_anything_checks: 'The government is said to be preparing a $500 check per household “to boost spending on whatever.”',
  mc_fake_exchange_airing: 'The stock exchange will reportedly close for three days “to air out the trading floor.”',
};
