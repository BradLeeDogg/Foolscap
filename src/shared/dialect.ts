/**
 * American↔British spelling pairs (deliberately limited to UNAMBIGUOUS
 * differences — pairs like tire/tyre, practice/practise, program/programme,
 * meter/metre, check/cheque are excluded because the "wrong" form is a real word
 * in the other dialect, which would produce false flags).
 */
export const AME_TO_BRE: Record<string, string> = {
  // -or / -our
  color: 'colour', colors: 'colours', colored: 'coloured', coloring: 'colouring',
  honor: 'honour', honors: 'honours', honored: 'honoured', honoring: 'honouring', honorable: 'honourable',
  favor: 'favour', favors: 'favours', favored: 'favoured', favoring: 'favouring',
  favorite: 'favourite', favorites: 'favourites', favorable: 'favourable',
  behavior: 'behaviour', behaviors: 'behaviours', behavioral: 'behavioural',
  neighbor: 'neighbour', neighbors: 'neighbours', neighborhood: 'neighbourhood', neighboring: 'neighbouring',
  labor: 'labour', labors: 'labours', labored: 'laboured',
  flavor: 'flavour', flavors: 'flavours', flavored: 'flavoured', flavoring: 'flavouring',
  humor: 'humour', humored: 'humoured',
  rumor: 'rumour', rumors: 'rumours',
  odor: 'odour', odors: 'odours',
  vapor: 'vapour', vapors: 'vapours',
  savior: 'saviour', harbor: 'harbour', harbors: 'harbours',
  armor: 'armour', armored: 'armoured',
  vigor: 'vigour', valor: 'valour', splendor: 'splendour', rigor: 'rigour',
  tumor: 'tumour', tumors: 'tumours', parlor: 'parlour',
  endeavor: 'endeavour', endeavors: 'endeavours',
  // -ize / -ise
  organize: 'organise', organizes: 'organises', organized: 'organised', organizing: 'organising',
  organization: 'organisation', organizations: 'organisations',
  realize: 'realise', realizes: 'realises', realized: 'realised', realizing: 'realising', realization: 'realisation',
  recognize: 'recognise', recognizes: 'recognises', recognized: 'recognised', recognizing: 'recognising',
  apologize: 'apologise', apologized: 'apologised', apologizing: 'apologising',
  emphasize: 'emphasise', emphasized: 'emphasised', emphasizing: 'emphasising',
  criticize: 'criticise', criticized: 'criticised', criticizing: 'criticising',
  memorize: 'memorise', memorized: 'memorised',
  prioritize: 'prioritise', prioritized: 'prioritised',
  summarize: 'summarise', summarized: 'summarised',
  specialize: 'specialise', specialized: 'specialised',
  analyze: 'analyse', analyzes: 'analyses', analyzed: 'analysed', analyzing: 'analysing',
  paralyze: 'paralyse', paralyzed: 'paralysed',
  // -og / -ogue
  catalog: 'catalogue', catalogs: 'catalogues', dialog: 'dialogue', dialogs: 'dialogues', analog: 'analogue',
  // -er / -re
  center: 'centre', centers: 'centres', centered: 'centred', centering: 'centring',
  theater: 'theatre', theaters: 'theatres', liter: 'litre', liters: 'litres',
  fiber: 'fibre', fibers: 'fibres', caliber: 'calibre', somber: 'sombre',
  meager: 'meagre', specter: 'spectre', luster: 'lustre',
  // doubled-l
  traveling: 'travelling', traveled: 'travelled', traveler: 'traveller', travelers: 'travellers',
  canceled: 'cancelled', canceling: 'cancelling', cancelation: 'cancellation',
  modeling: 'modelling', modeled: 'modelled', labeled: 'labelled', labeling: 'labelling',
  fueled: 'fuelled', fueling: 'fuelling', signaled: 'signalled', signaling: 'signalling',
  counseled: 'counselled', counselor: 'counsellor', counselors: 'counsellors',
  marvelous: 'marvellous', jewelry: 'jewellery', woolen: 'woollen',
  // -se / -ce
  defense: 'defence', defenses: 'defences', offense: 'offence', offenses: 'offences', pretense: 'pretence',
  // misc unambiguous
  gray: 'grey', grayer: 'greyer', plow: 'plough', plows: 'ploughs',
  mustache: 'moustache', pajamas: 'pyjamas', mold: 'mould', molded: 'moulded',
  smolder: 'smoulder', skeptic: 'sceptic', skeptical: 'sceptical', skepticism: 'scepticism',
  cozy: 'cosy', aluminum: 'aluminium', artifact: 'artefact', artifacts: 'artefacts',
  aging: 'ageing', airplane: 'aeroplane', airplanes: 'aeroplanes'
}

/** Reverse map, built once. */
export const BRE_TO_AME: Record<string, string> = Object.fromEntries(
  Object.entries(AME_TO_BRE).map(([a, b]) => [b, a])
)
