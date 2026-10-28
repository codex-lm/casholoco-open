import type { NewsText } from '../types';

/**
 * Batch “sites”: English texts for ../../fr/extra/sites.ts, keyed by the same ids. Life at the wells, mines,
 * refineries and foundries: each card moves the extraction cost of a commodity's supply sites, not its market price.
 * Tone of the batch: deadpan wire-service dispatch.
 */
export const EN_NEWS_SITES: Record<string, NewsText> = {
  // ---------------------------------------------------------------------------
  // Oil wells
  // ---------------------------------------------------------------------------
  st_oil_drillers_helmets: {
    headline: 'Drillers strike for hard hats that “don’t flatten the hair”',
    body: 'Wells have been crawling since Monday. Management offered visored helmets, deemed “too 1980s.” Pumping a barrel now costs twice as much until someone finds a stylist.',
    rumor: 'Drillers are reportedly unhappy with their helmets. A strike notice was allegedly filed “with the salon.”',
  },
  st_oil_well_inspection: {
    headline: 'Oil well inspection: every bolt must now sign the register',
    body: 'The ministry has launched an exhaustive check. The bolts sign slowly; some refuse. Extracting crude costs markedly more for three quarters.',
    rumor: 'The ministry is reportedly planning a “bolt tour” of the oil wells.',
  },
  st_oil_robot_drills: {
    headline: 'Robot drills work nights and never ask for overtime',
    body: 'They want neither bonuses nor coffee. Unions are studying how a drill should be represented. Pumping a barrel costs almost a third less.',
    rumor: 'Robot drills are reportedly being tested “very quietly” on several oil wells.',
  },
  st_oil_field_fog: {
    headline: 'Fog over the oil fields: drillers can’t find their wells',
    body: 'Crews wander between the derricks, flashlight in hand. Two wells have been found; a third is “being located.” Extracting crude costs a great deal more.',
  },

  // ---------------------------------------------------------------------------
  // Lithium mines
  // ---------------------------------------------------------------------------
  st_lithium_bats: {
    headline: 'Protected bats move into the lithium mines',
    body: 'Miners now work without noise or light, on tiptoe. Output suffers: digging up lithium costs more than twice as much.',
    rumor: 'Bat colonies have reportedly been spotted at the entrance of several lithium mines.',
  },
  st_lithium_poetry_break: {
    headline: 'Lithium miners win a twenty-minute poetry break every hour',
    body: 'The agreement was signed in iambic pentameter. The tunnels echo with sonnets while the carts wait. Extraction costs climb for three quarters.',
    rumor: 'A lithium miners’ union is reportedly drafting its demands... in verse.',
  },
  st_lithium_polite_dynamite: {
    headline: '“Eco-friendly” dynamite digs tunnels and apologizes to the rock',
    body: 'Faster and cheaper, it leaves a little note after every blast. Mining lithium costs almost a third less.',
    rumor: 'A “very polite” explosive is reportedly awaiting approval for lithium mines.',
  },
  st_lithium_lost_map: {
    headline: 'Lithium mine map lost: miners dig “by feel”',
    body: 'The only copy was reportedly used to steady a wobbly table. Crews drill a little everywhere, sometimes into the neighbors’. Mining lithium costs a lot more.',
  },

  // ---------------------------------------------------------------------------
  // Sugar refineries
  // ---------------------------------------------------------------------------
  st_sugar_bees: {
    headline: 'Bees occupy the sugar refineries and demand a share of the profits',
    body: 'Talks are stalling: the workers refuse any negotiator without stripes. Refining costs twice as much until a deal is struck.',
    rumor: 'Swarms have reportedly been seen scouting several sugar refineries.',
  },
  st_sugar_hairnets: {
    headline: 'New hygiene rule: three stacked hairnets required in sugar refineries',
    body: 'Workers can no longer see the machines, and the machines can no longer see the workers. Refining costs rise for three quarters.',
    rumor: 'A hairnet regulation is reportedly being drafted “in successive layers.”',
  },
  st_sugar_free_steam: {
    headline: 'Government gives sugar refineries free steam “so the city smells of caramel”',
    body: 'The measure aims to boost tourism. Residents love it; dentists less so. Refining sugar costs markedly less.',
    rumor: 'A “Caramel City” plan is reportedly under review at the tourism department.',
  },
  st_sugar_sticky_valves: {
    headline: 'Refinery valves stuck: the sugar caramelized everything over the weekend',
    body: 'Technicians are trying to unstick the equipment with hair dryers. Refining costs have flared up too.',
  },

  // ---------------------------------------------------------------------------
  // Chip foundries
  // ---------------------------------------------------------------------------
  st_chips_allergic_inspector: {
    headline: 'Clean-room audit: an inspector allergic to dust halts the chip foundries',
    body: 'Every sneeze triggers a new check. The wafers wait under glass. Making a chip costs twice as much.',
    rumor: 'A “very sensitive” inspector has reportedly been put in charge of clean-room audits.',
  },
  st_chips_exercise_bikes: {
    headline: 'Power cut: chip foundries run on exercise bikes',
    body: 'Engineers pedal in three shifts. Their calves are improving; output much less so. Production costs take off.',
    rumor: 'The power grid in industrial zones is reportedly showing “signs of fatigue.”',
  },
  st_chips_window_ai: {
    headline: 'AI optimizes the chip foundries and finds you just had to close the window',
    body: 'Yield jumps and the dust stays outside. The consultancy that had spent six years on the case asks for an extension. Making a chip costs almost a third less.',
    rumor: 'An optimization AI is reportedly being rolled out “on a trial basis” in several chip foundries.',
  },
  st_chips_beige_cleanrooms: {
    headline: 'Clean rooms repainted beige: engineers can’t find the wafers',
    body: 'Everything is the same color, chips included. Teams are feeling their way around. Production costs climb.',
  },

  // ---------------------------------------------------------------------------
  // Any commodity
  // ---------------------------------------------------------------------------
  st_any_royalty_holiday: {
    headline: '{commodity}: government forgets to bill extraction royalties',
    body: 'The billing software was updated on a Friday evening. Operators are careful not to mention it. Extraction costs markedly less while it lasts.',
  },
  st_any_foremen_strike: {
    headline: '{commodity}: foremen on strike, nobody knows which button to press',
    body: 'Crews press buttons at random until the strike ends. One machine started playing the accordion; another ordered forty pizzas. Extraction costs soar.',
    rumor: 'Foremen are reportedly threatening to “hand in their whistles.”',
  },
};

export const EN_RUMORS_SITES: Record<string, string> = {
  st_fake_oil_low_derricks: 'Drillers reportedly want “shorter derricks, for the vertigo.” Industrial action is said to be under consideration.',
  st_fake_lithium_ghost: 'A ghost is said to haunt the lithium mines; miners are reportedly refusing night shifts.',
  st_fake_sugar_diet: 'Sugar refineries are reportedly being put on a diet “in solidarity” with their customers.',
  st_fake_chips_mood: 'An internal audit reportedly faults the chip foundries for a “lack of enthusiasm.” Sanctions are said to be under review.',
};
