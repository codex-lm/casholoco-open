import type { NewsText } from '../types';

/** Batch “scandal”: English texts for ../../fr/extra/scandal.ts, keyed by the same ids. */
export const EN_NEWS_SCANDAL: Record<string, NewsText> = {
  // ---------------------------------------------------------------------------
  // AI and more-or-less artificial intelligence
  // ---------------------------------------------------------------------------
  sc_ai_mechanical_interns: {
    headline: '{company}’s revolutionary AI turns out to be 300 interns behind a curtain',
    body: 'Answers took forty minutes and came with typos. Management now calls it “artisanal intelligence.”',
    rumor: 'A buzzy AI startup reportedly ordered 300 office chairs and just as many sandwiches.',
  },
  sc_ceo_ai_pivot: {
    headline: '{ceo} posts that {company} is “pivoting to AI,” declines to say how',
    body: 'The post got two million likes and one letter from the securities regulator. Nobody inside the company had been told.',
    rumor: 'A big-name CEO reportedly stayed up all night drafting “a post that changes everything.”',
  },
  sc_ai_ethics_board: {
    headline: '{company} forms an AI ethics board made up entirely of its own AI',
    body: 'The board met 40,000 times in one second and declared itself “extremely satisfied with itself.” Investors hail it as best-in-class governance.',
  },
  sc_chatbot_insult: {
    headline: '{company}’s customer-service chatbot calls a customer a “low-margin resource”',
    body: 'The transcript went viral. The company insists the AI “was only repeating what it heard in meetings.”',
    rumor: 'Screenshots of an automated support chat are said to be making the rounds in group chats.',
  },
  sc_chatbot_apology_poet: {
    headline: '{company}’s chatbot writes apologies so moving that customers keep coming back for more',
    body: 'Some users are breaking their devices on purpose just to get a new poem. Management is looking into a paid tier.',
  },
  sc_ceo_deepfake: {
    headline: 'AI-generated fake {ceo} announces record profits; the real one confirms, just in case',
    body: 'The video was fake and so were the numbers, but nobody dares contradict a CEO smiling that hard. The stock rises; compliance is pulling its hair out.',
  },
  sc_ai_consultants: {
    headline: '{company} swaps its consultants for an AI: same advice, one-hundredth of the invoice',
    body: 'The AI also produced 200 slides and suggested an offsite. It just doesn’t bill for lunch.',
    rumor: 'A top-tier consulting firm has reportedly lost a longtime client to “some very polite software.”',
  },
  sc_ai_annual_report: {
    headline: '{company}’s AI-written annual report cites “revenue of 12 unicorns”',
    body: 'It also quotes a CFO who does not exist and a subsidiary on the Moon. The auditors have asked for “a few more sources.”',
    rumor: 'Auditors at a major company reportedly flagged a footnote as “a little too creative.”',
  },
  sc_biased_algo_cleared: {
    headline: 'Probe clears {company}: its “biased” algorithm was just equally bad for everyone',
    body: 'Experts conclude the AI discriminated against no one; it got everything wrong with perfect fairness. The company has put the report on a billboard.',
  },
  sc_ai_lawyer: {
    headline: '{company}’s AI lawyer gets a fine thrown out by citing a precedent it made up',
    body: 'The judge, dazzled by the machine’s confidence, checked nothing. The bar association has been checking everything ever since.',
  },
  sc_ai_esg_rating: {
    headline: 'AI ratings agency names {company} “world’s most ethical company” after reading its slogan',
    body: 'The algorithm only looked at the homepage, “because it was all there.” The company has already framed the certificate.',
    rumor: 'An ESG ratings agency has reportedly replaced its analysts with “very supportive” software.',
  },

  // ---------------------------------------------------------------------------
  // Connected gadgets and data
  // ---------------------------------------------------------------------------
  sc_voice_assistant_pizzas: {
    headline: '{company}’s voice assistant orders 4,000 pizzas after hearing a TV commercial',
    body: 'A single TV ad set off orders coast to coast. Customers refunded, drivers paid, pizzas eaten by the crisis team.',
  },
  sc_admin_password: {
    headline: 'Massive breach at {company}: the admin password was the company name plus “123”',
    body: 'Millions of customer accounts are out in the wild. Management promises a “full audit” and a more discreet sticky note.',
    rumor: 'Customer files from a major corporation are said to be circulating on some very shady forums.',
  },
  sc_smartwatch_steps: {
    headline: '{company}’s smartwatches were tripling step counts “for motivation”',
    body: 'Thousands of users thought they were marathoners for walking to the fridge. Consumer groups actually ran, straight to their lawyers.',
    rumor: 'A consumer lab reportedly had a robot walk on a treadmill all weekend long.',
  },
  sc_wellness_app_spy: {
    headline: '{company}’s employee “wellness” app was mostly timing bathroom breaks',
    body: 'The dashboard ranked departments by “flow.” Management swears the data was only used to “optimize paper supply.”',
    rumor: 'Staff at a big corporation reportedly noticed their meditation app kept asking for GPS access.',
  },
  sc_crypto_wallet_review: {
    headline: 'Hacker drains {company}’s crypto wallet, leaves a five-star review',
    body: '“Pleasant security, fast transfer, would recommend.” The company has filed a complaint; the hacker replied to the review.',
    rumor: 'A hacker is reportedly bragging about finding “a wide-open door” at a listed company.',
  },
  sc_teen_bug_bounty: {
    headline: 'Teen finds a hole at {company} and reports it instead of selling it; investors are stunned',
    body: 'The $50 bounty will be paid in gift cards. The kid asked for an internship; they offered him the CTO job.',
    rumor: 'A middle schooler reportedly sent a “very polite but very alarming” email to a listed company’s IT desk.',
  },
  sc_hacker_hired: {
    headline: 'The hacker who once terrorized {company} is hired as its head of security',
    body: '“He already knows all our systems, better than we do,” explains HR. Investors hail a hire with “no probation period required.”',
  },
  sc_gadget_mics_off: {
    headline: 'Gadget makers swear the microphones are “absolutely, totally” off now',
    body: 'They even added a little red light that turns off whenever you look at it. Trust is restored, and so are sales.',
  },
  sc_scooter_app_tracking: {
    headline: 'Scooter apps sold riders’ trips: “We know who goes to the gym, and who’s lying”',
    body: 'Location data ended up with advertisers, insurers and a bowling league. Riders are walking again.',
    rumor: 'A security researcher reportedly tracked every scooter ride in town for a week, “out of curiosity.”',
  },

  // ---------------------------------------------------------------------------
  // Startups, funding rounds and ghost products
  // ---------------------------------------------------------------------------
  sc_bot_users: {
    headline: '{company} claimed 10 million users; 9.9 million were bots',
    body: 'The other 100,000 are employees, their families and a dog. Investors would like a recount, by hand.',
    rumor: 'Auditors reportedly found “a lot of users named User” at a small listed company.',
  },
  sc_vc_footnote: {
    headline: 'Venture fund invests in {company} after spotting “AI” in a footnote',
    body: 'The two letters turned out to be part of the word “failing.” The check has cleared anyway, and nobody plans to send it back.',
  },
  sc_regulatory_sandbox: {
    headline: '{company} gets into the “regulatory sandbox,” free to test anything, mostly the regulator’s patience',
    body: 'Two whole years with no possible fines. The company has already planned fourteen experiments and a cake.',
  },
  sc_crowdfunding_wait: {
    headline: '{company}’s crowdfunding backers have been waiting four years for their product',
    body: 'The latest update promised “big progress on the box.” A class action is in the works, with a more reliable timeline.',
    rumor: 'A group of furious backers has reportedly hired a lawyer who “specializes in promises.”',
  },
  sc_vaporware_render: {
    headline: '{company} admits its flagship product, unveiled three years ago, exists “only as a 3D render”',
    body: 'The trade-show prototypes were nicely lit foam mockups. One analyst put his finger on it, literally.',
    rumor: 'An analyst reportedly tried to touch a prototype at a trade show and was walked out by security.',
  },
  sc_mystery_keynote: {
    headline: '{ceo} unveils a mystery device on stage; nobody knows what it does, everyone preorders',
    body: 'It has no name, no price and no announced purpose. Preorders already exceed three years of production.',
    rumor: 'A major company has reportedly rented an 8,000-seat arena and ordered an alarming amount of fog.',
  },
  sc_empty_box_drop: {
    headline: 'Limited drop: {company} sells 1,000 “numbered” empty boxes in nine seconds',
    body: 'Each buyer gets a certificate of authenticity for the nothing inside. Resale prices are already triple.',
    rumor: 'A listed company is said to be planning an “ultra-limited drop” whose contents nobody knows.',
  },
  sc_joke_product: {
    headline: '{ceo} jokes about a product {company} doesn’t make; it sells out anyway',
    body: 'The joke was about a “toaster for socks.” Two hundred thousand preorders later, the factory is trying to work out how to build one.',
  },
  sc_open_source: {
    headline: '{company} open-sources its code; thousands of volunteers fix its bugs for free',
    body: 'Management calls it “generosity”; developers call it “a planet-wide unpaid internship.” Everyone is happy, especially management.',
  },
  sc_subscription_trap: {
    headline: '{company} auto-enrolled every customer in “Premium Plus,” “out of love”',
    body: 'Canceling required a fax, a birth certificate and the answer to a riddle. The regulator solved it: the answer was a fine.',
    rumor: 'The regulator has reportedly spent three weeks trying, and failing, to cancel an online subscription.',
  },
  sc_salary_transparency: {
    headline: '{company} publishes every salary; employees discover they’re well paid',
    body: 'The shock is immense: nobody had ever seen the word “raise” without the word “freeze” right next to it. Applications are pouring in.',
    rumor: 'A big company reportedly leaked a spreadsheet “on purpose.” The unions are said to be baffled.',
  },

  // ---------------------------------------------------------------------------
  // CEOs, influencers and social media
  // ---------------------------------------------------------------------------
  sc_influencer_unboxing: {
    headline: 'Influencer unboxes a {company} product on livestream and bursts into tears',
    body: 'Fourteen minutes of sobbing, three million views. She says she wasn’t paid, then clarifies: a little.',
    rumor: 'A social media star has reportedly received a “very mysterious” package from a listed company.',
  },
  sc_influencer_betrayal: {
    headline: '{company} signs an influencer who announces on stream that he prefers the competition',
    body: 'The contract called for “authentic engagement.” It was extremely authentic.',
    rumor: 'A huge influencer has reportedly signed a record deal with a listed company “without reading the end.”',
  },
  sc_kid_youtuber: {
    headline: '12-year-old streamer ranks {company} “the most awesome company ever”; the stock agrees',
    body: 'His main argument: “The logo is blue.” Analysts have found no serious counterargument.',
  },
  sc_whistleblower_thread: {
    headline: 'Ex-{company} employee spills everything in an 87-post thread, emojis included',
    body: 'Each post reveals a shady practice, followed by “like if you’re shook.” The thread goes viral; the stock goes the other way.',
  },
  sc_pixel_forest: {
    headline: '{company} was offsetting its carbon by planting trees… in a video game',
    body: 'The forests do exist, in 8-bit. Environmental groups remain unconvinced by digital photosynthesis.',
    rumor: 'An environmental group reportedly spent the weekend playing a gardening game, “for work.”',
  },
  sc_gray_sweater_apology: {
    headline: '{ceo}’s gray-sweater apology video, shot against a blank wall, moves the nation',
    body: 'No music, no makeup, one perfectly framed tear. PR pros are calling it “a masterpiece of sincerity in 4K.”',
  },
  sc_ceo_biohacking: {
    headline: '{ceo} reveals anti-aging routine: 42 supplements, zero sleep, ice baths during meetings',
    body: 'Shareholders are uneasy that board meetings now take place in a hyperbaric chamber. Followers, meanwhile, are taking notes.',
  },
  sc_ceo_space_trip: {
    headline: '{ceo} buys a ride to space: eleven minutes of zero-g, three weeks of press releases',
    body: 'Back on the ground, the CEO said they had “seen Earth as a total addressable market.” Employees saw the expense report.',
  },
  sc_ceo_digital_detox: {
    headline: '{ceo} goes on a month-long digital detox; {company} stock jumps 15%',
    body: 'No phone means no posts, no polls, no hot takes on geopolitics. Investors are demanding an extension.',
  },

  // ---------------------------------------------------------------------------
  // Whole sectors and the whole market
  // ---------------------------------------------------------------------------
  sc_crypto_reserves_screenshot: {
    headline: 'Surprise audit: crypto exchanges’ reserves were a screenshot',
    body: 'Auditors zoomed in: it was a screenshot of a screenshot. Rival exchanges swear theirs is at least in high definition.',
    rumor: 'Auditors have reportedly asked to see a crypto exchange’s reserves “somewhere other than a PDF.”',
  },
  sc_virtual_yogurt_influencer: {
    headline: 'Virtual influencer sells yogurt like crazy: no stomach, but 8 million followers',
    body: 'She never eats, never sleeps and never asks for a fee. Yogurt sales climb and dairies dream of cloning her.',
    rumor: 'An ad agency has reportedly created a spokesmodel who “never asks for a fee or a lunch break.”',
  },
  sc_energy_drink_code_challenge: {
    headline: 'Viral “twelve cans, one night, one app” challenge floods ERs; energy drinks take the heat',
    body: 'No app was ever finished, but cardiologists logged plenty of overtime. Energy drink brands have been summoned to explain themselves.',
  },
  sc_archive_amnesia: {
    headline: 'AI glitch wipes the quarter’s news archives: every scandal is forgotten',
    body: 'Search engines now return nothing but casserole recipes. The CEOs involved rediscover the joy of going out without sunglasses.',
    rumor: 'The servers of a major digital news agency are said to show signs of “advanced fatigue.”',
  },
  sc_ai_audit_ambitious: {
    headline: 'Audit AI combs through ambitious bosses’ companies: 400 pages of “areas of concern”',
    body: 'Shady practices, misaligned slides and chronic overuse of the word “synergy”: the AI let nothing slide.',
    rumor: 'A regulator has reportedly bought an audit AI “that never takes a vacation.”',
  },
};

export const EN_RUMORS_SCANDAL: Record<string, string> = {
  sc_fake_chatbot_board: 'A major listed company has reportedly replaced its entire board of directors with a single chatbot.',
  sc_fake_live_resignation: 'The CEO of a high-profile company will reportedly resign soon… live, on social media.',
  sc_fake_smartwatch_aging: 'A study supposedly proves that smartwatches make you age faster. A giant recall is said to be under review.',
  sc_fake_ai_washing_fine: 'A record fine is said to target any company that wrote “AI” in a press release without using any.',
  sc_fake_password_dump: 'A massive password leak is said to hit three listed companies. The lists are reportedly already circulating.',
  sc_fake_energy_drink_expose: 'A social media star is reportedly filming a video to “expose” a major energy drink brand.',
  sc_fake_ai_chip_hoard: 'AI giants have reportedly bought up the entire chip output for the next two years, in secret.',
  sc_fake_domain_takeover: 'A fund is said to be about to buy the smallest company on the market “purely for its domain name.”',
  sc_fake_lost_keys: 'A major crypto exchange has reportedly lost the keys to its vaults. Withdrawals are “temporarily philosophical.”',
  sc_fake_scooter_remote: 'A big rental company’s scooters could reportedly be hacked remotely with a plain garage-door opener.',
  sc_fake_lithium_free_battery: 'A startup will reportedly unveil a lithium-free battery “any day now,” charged by positive vibes.',
  sc_fake_datacenter_generators: 'AI data centers are said to be running on diesel generators now. Oil could skyrocket.',
  sc_fake_no_real_ai: 'A confidential audit supposedly shows that none of the listed companies’ “AIs” are actually AI.',
  sc_fake_finfluencer_pump: 'A finance influencer has reportedly promised his followers to “send” a small-cap stock “to the moon” on Monday.',
  sc_fake_robot_lithium: 'Big Tech is said to be stockpiling lithium in secret warehouses for its future robot butlers.',
};
