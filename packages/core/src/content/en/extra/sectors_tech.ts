import type { NewsText } from '../types';

/**
 * Batch “sectors_tech”: English texts for ../../fr/extra/sectors_tech.ts, keyed by the same ids.
 * Office-life observational humor (open-plan offices, offsites, video calls, professional networks).
 * Adaptations, not translations: the joke may change as long as it matches the effect.
 */
export const EN_NEWS_SECTORS_TECH: Record<string, NewsText> = {
  // ---------------------------------------------------------------------------
  // Smart gadgets
  // ---------------------------------------------------------------------------
  st_gadgets_wellness_bracelet: {
    headline: 'HR hands every employee a smart wristband “for wellness”: gadget makers can’t keep up',
    body: 'The band tracks steps, sleep and minutes spent at the coffee machine. HR calls it “wellness,” employees call it “a time clock on your wrist.” Every company is ordering one per head.',
    rumor: 'Several HR departments have reportedly requested quotes for “devices that count steps, and everything else.”',
  },
  st_gadgets_flex_office: {
    headline: 'Hot-desking everywhere: with no desk of their own, workers buy gadgets to mark their territory',
    body: 'Smart lamp, smart fan, smart plant with a moisture sensor: everyone rebuilds their desk from scratch each morning in eight minutes. The sector sends the open-plan office a thank-you card.',
  },
  st_gadgets_secret_santa: {
    headline: 'Office gift exchange: the smart gadget is crowned the universal “not too personal” present',
    body: 'Fifteen-dollar budget, zero ideas: the smart toothbrush rescues thousands of Secret Santa draws. The guy from accounting whose name nobody knows is getting a smart thermometer.',
  },
  st_gadgets_meeting_room_sensors: {
    headline: 'Sensors finally catch the meeting rooms booked “just in case”: companies order them by the pallet',
    body: 'The little box spots the room blocked since 9 a.m. by someone working from home. Gadget makers rejoice, and chip foundries get some very urgent purchase orders.',
    rumor: 'Facilities departments at several large companies have reportedly put a price on meeting rooms that are “empty but booked.”',
  },
  st_gadgets_unboxing_post: {
    headline: 'On professional networks, unboxing a gadget becomes “a learning moment”',
    body: '“This smart pen taught me more about leadership than my MBA. Here are 7 lessons.” The post got 40,000 shares, the pen 40,000 buyers.',
  },
  st_gadgets_it_lockdown: {
    headline: 'IT bans every smart device from the office: a coffee maker had joined the payroll network',
    body: 'The coffee maker knew everyone’s salary. Companies clear their open-plan floors of anything that blinks, and business-to-business gadget sales fall off a cliff.',
    rumor: 'IT managers have reportedly spotted “an unknown and very chatty device” on the network at several corporate headquarters.',
  },
  st_gadgets_notification_study: {
    headline: 'Study: the average employee gets 340 notifications a day, 200 of them from their lamp',
    body: 'Occupational health recommends “fewer objects that talk.” Workers unplug, sales slow down and, for the first time since 2019, the lamp goes quiet.',
  },
  st_gadgets_smart_desk_recall: {
    headline: 'Smart standing desk rises on its own mid-video-call: massive recall, in the upright position',
    body: 'The desk confused “end of meeting” with “liftoff.” 200,000 units are being recalled, and just as many managers presented their budget standing up without ever deciding to.',
    rumor: 'Managers have reportedly flagged desks that are “a little too autonomous” during video calls.',
  },
  st_gadgets_hackathon: {
    headline: '48-hour hackathon at {company}: a gadget is born, three developers request a day off',
    body: 'The prototype was pitched at 6 a.m., in pajamas, to a jury in pajamas. Investors love it. The developers are asleep under the ping-pong table.',
  },
  st_gadgets_coworking_boom: {
    headline: 'Coworking spaces pop up everywhere, and every desk wants its own smart outlet',
    body: 'For $400 a month: a desk, lukewarm coffee and a community of “passionate people.” Operators load every table with smart gadgets to justify the $400.',
    rumor: 'Developers have reportedly filed permits for “a lot” of shared workspaces, every one of them with a designer coffee machine.',
  },
  st_gadgets_procurement_hoard: {
    headline: 'Electronics buyers read one article on “resilience” and stockpile everything',
    body: 'The article was four paragraphs long; the purchase orders run forty pages. Everyone ordered three years’ worth of chips on the same morning, and the market took the order.',
    rumor: 'Procurement teams at several electronics makers have reportedly all forwarded the same article, subject line: “We need to talk.”',
  },
  st_gadgets_security_refresh: {
    headline: 'Security flaw: every office speaker must go, and manufacturers send the flaw a fruit basket',
    body: 'The break-room speaker had been broadcasting the executive committee’s meetings. Companies toss everything and buy it all again, sighing, but buying.',
    rumor: 'Security researchers are reportedly preparing a talk about “an object that is probably sitting on your desk right now.”',
  },

  // ---------------------------------------------------------------------------
  // E-scooters
  // ---------------------------------------------------------------------------
  st_scooters_mobility_allowance: {
    headline: 'Commuter benefit extended to e-scooters: HR signs off without reading',
    body: 'Every employee can expense an electric ride “to get to work,” remote workers included. Dealers stay open until midnight, and HR discovers the bill in March.',
    rumor: 'A commuter-benefit rule is said to be “in final review,” with a “very broad” list of eligible vehicles.',
  },
  st_scooters_meeting_minutes: {
    headline: 'Study: the e-scooter saves eleven minutes per meeting, or three extra meetings a day',
    body: 'Managers show up early, which had never happened before. Companies buy entire fleets “for productivity” and the calendars fill right back up.',
  },
  st_scooters_campus_fleet: {
    headline: 'New corporate campuses are so big the e-scooter becomes “a collaboration tool”',
    body: 'Half a mile between the “Serenity” room and the coffee machine. Corporations order fleets, complete with branded helmets and a 12-page usage policy.',
    rumor: 'A large corporation has reportedly opened a headquarters “so vast you will have to ride to lunch.”',
  },
  st_scooters_elevator_ban: {
    headline: 'Office buildings ban e-scooters from the elevators: managers go back to the bus',
    body: 'Building management cites “marks on the lobby carpet.” With nowhere to park it, workers give up the scooter, or park it on their desk, to the horror of hot-desking.',
    rumor: 'Several office-building managers are reportedly drafting rules on “personal wheeled devices.”',
  },
  st_scooters_helmet_hair: {
    headline: 'Mandatory helmets on e-scooters: helmet hair becomes an HR issue',
    body: 'Executives refuse to walk into the leadership meeting “looking like that.” Sales slide, and every barber in the financial district now opens at 7:30 a.m.',
  },
  st_scooters_offsite_ditch: {
    headline: '{ceo} ends {company}’s leadership retreat in a ditch, on an e-scooter, in a tie',
    body: 'The “team bonding on two wheels” activity lasted four minutes. The consulting firm running it will bill the full day. The video is making the rounds of every open-plan office.',
  },
  st_scooters_return_to_office: {
    headline: 'Big companies end remote work: the e-scooter is once again the most coveted object in the office',
    body: 'The return-to-office memo was three lines long, one of them in bold. Thousands of employees rediscover the commute, and so does oil, a little.',
    rumor: 'Several large corporations are reportedly drafting a three-line return-to-office memo, with one word in bold.',
  },
  st_scooters_bike_room_fire: {
    headline: 'E-scooters catch fire in corporate bike rooms: insurers cancel the policies',
    body: 'The room on level B2 burned during the weekly check-in, which was not interrupted. Companies ban batteries from the basement, and employees sell off their rides.',
    rumor: 'Insurers have reportedly sent companies a “very detailed” questionnaire about batteries stored in basements.',
  },
  st_scooters_lithium_post: {
    headline: 'E-scooter CEO posts “Why I bought all the available lithium”: 12,000 reactions',
    body: 'The post opens with “I don’t usually post this kind of thing, but.” It ends on a lithium shortage and an invitation to “share your thoughts below.” Prices share theirs.',
    rumor: 'An executive who is very active on professional networks is reportedly preparing a post about batteries that “will get people talking.”',
  },
  st_scooters_self_managed_teams: {
    headline: 'E-scooter plants switch to “self-managed teams”: the workers give themselves a raise',
    body: 'The method promised fewer bosses. There are just as many, but wages are now set on the shop floor by a show of hands, and every hand is up.',
  },
  st_scooters_immersion_interns: {
    headline: 'E-scooter makers replace their workers with six-month “immersion internships”',
    body: 'Each intern assembles four scooters a day “to understand the product.” The internship report is optional, and so is the stipend. Costs melt away, and so does the image, a bit.',
  },
  st_lithium_recycling_seminar: {
    headline: 'The battery industry’s offsite actually produces a deal: used lithium goes back to the plant',
    body: 'After two days of icebreakers and a drawing workshop, the manufacturers signed a recycling agreement on a napkin. Recycled lithium floods in and prices relax.',
    rumor: 'Battery manufacturers have reportedly extended their annual offsite by a day “to sign something.”',
  },

  // ---------------------------------------------------------------------------
  // Crypto & NFTs
  // ---------------------------------------------------------------------------
  st_crypto_cfo_webinar: {
    headline: 'CFO moves his company’s cash into crypto “following a webinar”',
    body: 'The webinar ran 45 minutes, 30 of them spent fixing the audio. The other CFOs, who were also on the call, did the same, so as not to look out of touch.',
    rumor: 'A chief financial officer reportedly asked “a lot of questions” during a webinar on digital assets.',
  },
  st_crypto_certification_nft: {
    headline: 'Professional certifications go NFT: everyone pins twelve to their profile',
    body: '“Certified Agile Leadership Level 3, on the blockchain.” Nobody knows what it’s worth, which is precisely the point of an NFT. Recruiters are asking for them.',
  },
  st_crypto_coffee_token: {
    headline: 'Company pays for its coffee with a homemade token: “BrewCoin” is now worth more than the company',
    body: 'The token was meant to speed up the line at the machine. It now trades on three exchanges, and the intern who coded it has stopped answering internal emails.',
  },
  st_crypto_sales_afterwork: {
    headline: 'Sales team happy hour turns into a group buying spree: crypto rises with the mood',
    body: 'Around 9 p.m., someone said “let’s all go in together.” By 9:05, the token was up 18%. By 11, the VP of Sales was calling it a “team goal.”',
    rumor: 'A sales team is reportedly planning a “themed” happy hour, with a trading app installed on every phone.',
  },
  st_crypto_expense_reports: {
    headline: 'Compliance training: managers discover they bought NFTs on the corporate card',
    body: 'Accounting found 87 “client entertainment” expenses denominated in pixelated otters. The demanded repayments trigger a wave of selling, and a few resignations.',
  },
  st_crypto_intern_password: {
    headline: '{company}’s intern finishes his internship and takes the crypto wallet password with him',
    body: 'He left a sticky note: “Password: ask the previous intern.” The previous intern is on a gap year. The treasury waves goodbye to its tokens.',
  },
  st_crypto_reply_all: {
    headline: '“Reply all” reveals the founder of a major crypto platform has never opened the code',
    body: 'The email read: “Does anyone know where the blockchain is? The folder?” It reached 3,000 employees and, by accident, two reporters. Investors head for the exits.',
    rumor: 'A “deeply embarrassing” internal email is reportedly circulating at a major digital-asset platform.',
  },
  st_crypto_boardroom_buzzword: {
    headline: 'Boards drop “blockchain” from their slide decks: the word no longer gets applause',
    body: 'For five years, saying it was enough to raise a round. Now the directors check their watches. The sector is looking for a new word, and for buyers.',
    rumor: 'Consultants have reportedly advised their clients to “refresh the vocabulary” of their investor decks.',
  },
  st_crypto_office_mining: {
    headline: 'Employees mine crypto on office computers: IT orders chips by the truckload',
    body: 'The IT department wondered why the workstations ran hot at night. It replaces the entire fleet, the miners get right back to it, and chips get scarce.',
    rumor: 'Electricity bills at several office towers have reportedly “doubled with no explanation” over the past quarter.',
  },
  st_crypto_annual_review: {
    headline: 'Regulator imposes an annual performance review on every crypto holder, with “areas for improvement”',
    body: 'Thirty minutes, a self-assessment form and a skills matrix. Investors would rather sell everything than attend. The regulator notes “low engagement.”',
    rumor: 'The markets regulator is reportedly hiring “aggressively” for one-on-one review officers.',
  },
  st_crypto_metaverse_offsite: {
    headline: 'Company offsite held in the metaverse: 400 avatars in button-downs, zero bus rides',
    body: 'The workshops took place on a virtual beach where everyone hovered four inches above the sand. Companies buy digital land, and headsets to look at it with.',
    rumor: 'A large company has reportedly canceled its usual offsite resort booking “for an immersive alternative.”',
  },

  // ---------------------------------------------------------------------------
  // Targeted companies and cross-sector
  // ---------------------------------------------------------------------------
  st_ceo_humbled_posts: {
    headline: '{ceo} posts “humbled and honored” forty times in one quarter: {company} investors stop reading',
    body: 'Humbled by an award, a nomination, a coffee, a Tuesday. Analysts automated the reading of the posts and sold on the thirty-ninth occurrence.',
  },
  st_company_all_hands: {
    headline: '{company} holds a four-hour all-hands: one keyword, seven slides and the stock goes up',
    body: 'The keyword was “together.” It came up 61 times. Employees mostly remember the buffet; investors remember slide 4, the one with the arrow going up.',
  },
  st_richest_frugal_offsite: {
    headline: '$3 million executive retreat at {company}: the word “frugality” on every slide',
    body: 'The biggest company on the board rented a private island to “rethink its cost base.” The “lean living” workshop was held beside the infinity pool. The invoice leaked.',
    rumor: 'A very large company has reportedly booked an entire island for an offsite on a “still confidential” theme.',
  },
  st_smallest_foosball: {
    headline: '{company} hires “for the culture”: foosball, a fruit bowl and a rising stock',
    body: 'The smallest company on the board can’t afford raises, but it has bananas on Mondays. New grads flock in, and investors follow.',
  },
  st_topprofit_celebration: {
    headline: '{company} celebrates its results with a three-day retreat: competitors recruit in the parking lot',
    body: 'The most profitable company of the quarter treated its teams to three days of “celebration.” Headhunters waited outside with offers and hot coffee.',
    rumor: 'Headhunters have reportedly agreed to meet near a corporate retreat center, “just in case.”',
  },
  st_mostscandalous_escape_game: {
    headline: 'Redemption team-building at {company}: escape room, tears and a “new code of ethics”',
    body: 'The most scandal-ridden company on the board locked its executives in a room until they found “the values.” It took them 3 hours and 40 minutes. The public wipes the slate clean.',
  },
  st_sector_wellbeing_week: {
    headline: 'Workplace Wellness Week: HR declares {sector} an official “wellness product”',
    body: 'The product is handed out on every open-plan floor, with a breathing workshop and a satisfaction survey. Corporate orders go through the roof.',
    rumor: 'Workplace wellness officers are reportedly looking for a “flagship product” for their annual week.',
  },
  st_sector_expense_policy: {
    headline: 'New expense policy: {sector} struck from reimbursable expenses “for consistency”',
    body: 'The finance department’s memo runs four pages and one table. Employees, who mostly bought that stuff on the corporate card, stop buying it altogether.',
  },
  st_players_inspiring_employers: {
    headline: '“Most Inspiring Employers” ranking: flesh-and-blood bosses sweep the podium',
    body: 'The jury counted posts, ping-pong tables and uses of the word “empathy” per square foot. Companies run by a real boss take every spot on the podium.',
  },
  st_macro_camera_off: {
    headline: 'Video-call fatigue hits the trading floors: analysts turn off their cameras, then sell everything',
    body: 'After the 900th remote meeting of the quarter, trading desks run on mute, camera off and morale at rock bottom. Prices follow the morale.',
    rumor: 'Several banks have reportedly banned remote meetings “with no agenda.” Team morale is said to be “under review.”',
  },
};

/** Fake but plausible rumors of this batch, keyed by FakeRumor.id. */
export const EN_RUMORS_SECTORS_TECH: Record<string, string> = {
  st_fake_admin_bracelets: 'A major government agency is reportedly about to issue a smart wristband to every employee. The request for proposals is said to be imminent.',
  st_fake_chips_foundry_offsite: 'Chip foundries are said to be shutting their plants for a full week for a global “team cohesion” offsite. Inventories could run short.',
  st_fake_lithium_viral_post: 'A battery-industry executive has reportedly drafted a long post about an “imminent lithium shortage.” Publication is scheduled for Monday morning.',
  st_fake_scooter_dress_code: 'Several large corporations are reportedly considering banning e-scooters in their dress code, somewhere between flip-flops and shorts.',
  st_fake_crypto_payroll: 'A large corporation will reportedly soon offer to pay part of its salaries in digital tokens, “on a voluntary basis.”',
  st_fake_open_space_decree: 'The Labor Department is reportedly drafting a rule capping open-plan offices at twelve people. Smart partition makers are said to be rubbing their hands.',
  st_fake_nft_diplomas: 'Top business schools will reportedly soon issue their diplomas as NFTs, with an optional “gold frame.”',
  st_fake_talking_objects_tax: 'A tax on “objects that talk” is reportedly under consideration to fund silence in the workplace.',
  st_fake_state_scooter_fleet: 'The government will reportedly order 200,000 e-scooters for its civil servants, “to keep the hallways moving.”',
  st_fake_exchange_phone_free_offsite: 'A major crypto exchange has reportedly summoned all its employees to a “phone-free” offsite. Cynics are whispering the word “bankruptcy.”',
  st_fake_badge_makers_chips: 'Access-badge manufacturers have reportedly pre-ordered half the quarter’s chips for a new model “that smiles.”',
  st_fake_video_calls_study: 'A forthcoming study reportedly concludes that video calls push the stock market down. Analysts have yet to turn on their cameras to comment.',
  st_fake_gadget_survey: 'An internal survey at a large corporation reportedly shows that 92% of employees want “fewer gadgets and more chairs.”',
  st_fake_lithium_mine_renovation: 'A major lithium mine will reportedly close for three months to “renovate the collaborative space.” Prices could tighten.',
  st_fake_blockchain_reviews: 'Annual performance reviews will reportedly soon be certified on the blockchain, with one NFT per “area for improvement.”',
};
