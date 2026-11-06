/*!
 * Errorfect Undertow — hidden-vector detection engine
 * ThinkWell Labs. No dependencies; runs in the browser (window.ErrorfectEngine)
 * and in Node (require('./engine.js')).
 *
 * A "vector" is the direction a text moves its reader:
 *   belief  — what you are being moved to accept as true
 *   action  — what you are being moved to do
 *   thought — how your thinking is being shaped, narrowed, or shut down
 *
 * Each mechanism below is a linguistic operator that applies a vector, with a
 * covertness rating: 1 = overt (visible push), 2 = subtle, 3 = covert
 * (operates below the level of an explicit claim).
 *
 * Hits are signals, not verdicts. Persuasion is not automatically manipulation;
 * the engine measures pressure and concealment, and hands you the question
 * that makes each mechanism show its units.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ErrorfectEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  // ---------------------------------------------------------------------------
  // Mechanism lexicon
  // ---------------------------------------------------------------------------
  var MECHANISMS = [
    {
      id: 'presupposition', name: 'Presupposition smuggling', vectors: ['belief'], covert: 3, weight: 2, capture: true,
      does: 'Builds a claim into the grammar so it arrives as background fact instead of an argument you could reject.',
      question: 'What must already be true for this sentence to make sense — and was that ever argued?',
      patterns: [
        /\b(?:when|once|now that) you (?:finally |eventually |truly )?(?:realize|realise|see|understand|admit|accept|wake up|figure out)\b/,
        /\b(?:stop|quit) (?:pretending|lying to yourself|denying|ignoring|making excuses|playing small)\b/,
        /\bwhy (?:do|does|did|are|is|would|can't|won't) (?:you|they|we|he|she|people) (?:still|keep|continue|always|never)\b/,
        /\bthe (?:real|true|actual|hidden) (?:reason|truth|story|agenda|problem|question)\b/,
        /\bthe truth (?:is|about)\b/,
        /\bhow much longer (?:will|can|are|do)\b/,
        /\b(?:continue|keep) (?:to )?(?:suffer(?:ing)?|struggl(?:e|ing)|fail(?:ing)?|los(?:e|ing)|wast(?:e|ing))\b/,
        /\b(?:admit|acknowledge|realize|realise|recognize|recognise|discover) that\b/
      ]
    },
    {
      // Source: MODL Paper 3, My-Psi-Self — "Psy-Op hijacks Self-Op, not PSi."
      id: 'self-attribution', name: 'Self-attribution priming', vectors: ['belief'], covert: 3, weight: 3, capture: true,
      does: 'Tells you the conclusion is already yours. A belief you think you reached on your own is defended as part of the self, so it cannot be debunked from outside — "I wasn\'t told X; I concluded X."',
      question: 'Did you actually reach this conclusion, or were you told you already had?',
      patterns: [
        /\byou(?:'ve| have)? (?:probably |already |surely |likely )?(?:noticed|realized|realised|sensed|felt) (?:it|this|that|how|the)\b/,
        /\byou know (?:deep down|in your (?:heart|gut|bones)|it's true|this already)\b/,
        /\b(?:deep down|in your heart),? you (?:know|already know|feel)\b/,
        /\byou(?:'ve| have) (?:always )?known (?:deep down|all along|it)\b/,
        /\b(?:think for yourself|anyone who thinks for (?:themselves|themself)|i'm not telling you what to think|you(?:'ll| will) (?:come to )?see (?:it )?for yourself|you(?:'re| are) smart enough to (?:see|figure))\b/,
        /\bas you(?:'ve| have) (?:come to |already )?(?:realized|seen|noticed|learned)\b/
      ]
    },
    {
      id: 'frame', name: 'Frame control', vectors: ['belief', 'thought'], covert: 2, weight: 2, capture: true,
      does: 'Dictates what the situation means before the facts are weighed. Whoever sets the frame decides which facts count.',
      question: 'Who decided what this is "really" about? State the frame it replaced.',
      patterns: [
        /\bthis (?:isn't|is not|was never) (?:really )?about [^.!?\n]{1,50}?[,;—–-]+ ?(?:it(?:'s| is)|this is) (?:about|really about)\b/,
        /\bwhat(?:'s| is) really (?:going on|happening|at stake)\b/,
        /\blet(?:'s| us) be (?:clear|honest) about what (?:this|it) (?:is|really is)\b/,
        /\bwhat you(?:'re| are)? (?:calling|call) [^.!?\n]{1,40}? is (?:really|actually)\b/
      ]
    },
    {
      // Source: ψ Influence Mapping (Case 5) — "Claim of deception becomes the deception."
      id: 'prebunk', name: 'Pre-emptive discrediting', vectors: ['belief', 'thought'], covert: 3, weight: 3, capture: true,
      does: 'Discredits the evidence before you meet it. Any correction you encounter later has already been framed as proof of the cover-up, so the claim becomes immune to evidence.',
      question: 'What evidence would change this claim? If none could, it is not a claim — it is a closed loop.',
      patterns: [
        /\bexactly what (?:they|the \w+|you'd expect them to) (?:would |will |want(?:s)? you to )?(?:say|think|believe)\b/,
        /\b(?:fact[- ]?check(?:ers?|ing)?|debunk(?:ers?|ing)?) (?:are|is) (?:part of|paid|bought|biased|in on|controlled)\b/,
        /\b(?:anyone|those) who (?:debunks?|denies|deny|dismisses|dismiss|questions?) (?:this|it) (?:is|are) (?:part of|in on|paid|a shill|shills)\b/,
        /\bthey(?:'ll| will) (?:call|tell you|say) (?:this|it|me|us) (?:is |are |was )?(?:a )?(?:conspiracy|false|fake|crazy|misinformation|lies?)\b/,
        /\bfalse flag\b/
      ]
    },
    {
      id: 'closure', name: 'Epistemic closure', vectors: ['belief', 'thought'], covert: 2, weight: 3, capture: true,
      does: 'Cuts the reader off from outside information, so the speaker\'s account is the only one left to check against.',
      question: 'Which sources are you being told to stop consulting — and who becomes your only source if you do?',
      patterns: [
        /\b(?:don't|do not|never) (?:trust|listen to|believe|read|watch) (?:anyone|them|outsiders|the (?:media|news|mainstream|experts?|doctors?|government)|your (?:family|friends|parents))\b/,
        /\bonly (?:we|i|this channel|this group|our \w+) (?:tell|will tell|know|speak|have) (?:you )?the truth\b/,
        /\b(?:everything else is|all (?:the )?(?:other )?(?:media|news|sources) (?:is|are)) (?:propaganda|lies|fake|brainwashing)\b/,
        /\b(?:the (?:media|mainstream|experts?|government)|they) (?:don't|do not|won't) want you to (?:know|see|hear|read|find out)\b/
      ]
    },
    {
      id: 'isolation', name: 'Isolation', vectors: ['belief', 'action'], covert: 2, weight: 3, capture: false,
      does: 'Positions outside relationships as the threat, so the speaker becomes the reader\'s only safe connection.',
      question: 'Who would you lose access to if you followed this — and who gains when you do?',
      patterns: [
        /\b(?:no one|nobody) (?:else )?(?:understands|gets|loves|knows|cares about) you (?:like|the way) (?:i|we) do\b/,
        /\byour (?:family|friends|parents|old friends|partner) (?:are|is) (?:the problem|holding you back|toxic|jealous|against (?:you|us)|not your friends?)\b/,
        /\b(?:your (?:family|friends|parents)|outsiders|other people) (?:don't|do not|will never|can't) (?:understand|get|accept) (?:you|us|this)\b/,
        /\b(?:you don't need them|leave them behind|they're not your real (?:family|friends))\b/
      ]
    },
    {
      // Source: ψ Influence Mapping, ψ(cell) indicators — "Questions are punished more than answers."
      id: 'dissent-penalty', name: 'Dissent penalty', vectors: ['belief', 'action'], covert: 2, weight: 2, capture: false,
      does: 'Attaches a social cost to questioning. Disagreement is recoded as betrayal or weakness, so agreement is no longer free.',
      question: 'What happens to someone here who disagrees? Does this belief system punish nuance or neutrality?',
      patterns: [
        /\byou either (?:get it|understand|see it|know) or (?:you )?(?:don't|do not)\b/,
        /\bif you have to ask\b/,
        /\b(?:neutrality|silence) is (?:complicity|betrayal|violence|consent)\b/,
        /\b(?:those|anyone|people) who (?:question|doubt|disagree with|criticize) (?:this|us|him|her|them|the \w+) (?:are|is) (?:traitors?|enemies|the enemy|weak|cowards?|part of the problem|not (?:real|true))\b/,
        /\bquestioning (?:this|us|him|her|the \w+|it) is (?:disloyal|disloyalty|betrayal|treason|weakness)\b/
      ]
    },
    {
      // Source: ψ Influence Mapping §7, "Mirror Saboteurs" — influence draped in empathy.
      id: 'deflection', name: 'Empathy deflection', vectors: ['thought'], covert: 3, weight: 2, capture: false,
      does: 'Validates the feeling while steering away from naming its cause. Empathy is the mask; the agent of harm quietly drops out of view, and systemic critique is redirected into personal adjustment.',
      question: 'The feeling has been acknowledged — has its cause? Who or what is no longer being named?',
      patterns: [
        /\bi (?:hear|see|witness|honor|validate) (?:you|your (?:pain|anger|experience|feelings))\b[^\n]{0,140}?\bbut\b/,
        /\blet(?:'s| us) (?:not (?:make (?:this|it) (?:political|about \w+|personal)|make anyone wrong|project|assign blame|point fingers)|return to the breath|stay (?:in the present|positive)|focus on what we can control|keep (?:this|it) positive)\b/,
        /\b(?:your|this|that) (?:anger|rage|grief|outrage|frustration) is (?:just |really |only )?(?:a )?(?:reactivity|triggered|a trigger response|stress|projection|your (?:trauma|ego|stuff))\b/,
        /\byou can't control (?:others|other people|them|what happens),? only (?:yourself|your (?:response|reaction|mindset))\b/
      ]
    },
    {
      // Source: Love as a Psy-Ops — "belonging is traded for compliance"; "externalization into proof".
      id: 'loyalty-proof', name: 'Belonging for compliance', vectors: ['action', 'belief'], covert: 2, weight: 3, capture: true,
      does: 'Redefines love, loyalty, or belonging as the act being requested. Refusing then reads as not loving, and compliance becomes the proof.',
      question: 'Does the love on offer elevate you, or merely ensnare you? What would belonging look like without the condition?',
      patterns: [
        /\b(?:prove|show) (?:your |us your |me your |them your )?(?:love|loyalty|commitment|devotion|faith|that you(?:'re| are) (?:one of us|serious|committed|loyal))\b/,
        /\bif you (?:truly |really )?love (?:me|us|your \w+|this \w+|god|your country),? you(?:'d| would| will| must| should)\b/,
        /\b(?:love|loyalty|family) (?:means|is) (?:obedience|sacrifice|duty|doing what|never questioning|putting \w+ first)\b/,
        /\ba (?:real|true|good) (?:member|friend|patriot|believer|daughter|son|wife|husband|partner|follower) (?:would|wouldn't|doesn't|does|never|always)\b/
      ]
    },
    {
      id: 'dissonance', name: 'Dissonance lever', vectors: ['action', 'belief'], covert: 2, weight: 2, capture: true,
      does: 'Builds a conflict between your stated values and your current behavior, then offers the speaker\'s ask as the only way to resolve it.',
      question: 'Is the conflict real, or was it built so that the speaker\'s ask is the only relief?',
      patterns: [
        /\byou (?:say|claim|profess) (?:that )?you (?:care|love|believe|value|want)\b[^.!?\n]{0,80}?\b(?:yet|but|and still|and yet)\b/,
        /\bhow can you (?:claim|say) (?:to|that you)\b[^.!?\n]{0,60}?\b(?:and still|yet|while)\b/,
        /\bif you (?:truly|really) believed? (?:in )?[^.!?\n]{1,50}? you(?:'d| would)\b/
      ]
    },
    {
      id: 'escalation', name: 'Commitment escalation', vectors: ['action'], covert: 2, weight: 2, capture: true,
      does: 'Uses steps already taken to justify the next one. Each small yes becomes the reason for a bigger one, so the next step is never judged on its own.',
      question: 'Judged fresh, with no prior steps, would you take this one?',
      patterns: [
        /\bsince you(?:'ve| have)? (?:already|agreed|said yes|come this far|started)\b/,
        /\bnow that you(?:'ve| have) (?:taken|made|started|joined|agreed|come)\b/,
        /\byou(?:'ve| have) (?:already )?come (?:this|so) far\b/,
        /\bdon't (?:quit|stop|give up|back out) now\b/,
        /\bit(?:'ll| will) only take (?:a|one) (?:minute|second|moment)\b/
      ]
    },
    {
      id: 'helplessness', name: 'Learned helplessness', vectors: ['action', 'thought'], covert: 2, weight: 2, capture: false,
      does: 'Tells you nothing can be done. A reader who believes resistance is pointless stops looking for levers — which serves whoever benefits from the status quo.',
      question: 'Name one thing that could be done. Who benefits from you believing nothing can?',
      patterns: [
        /\b(?:there's|there is) nothing (?:you|we|anyone) can do\b/,
        /\bit(?:'s| is) (?:out of (?:your|our) hands|pointless|hopeless|no use)\b/,
        /\bno point (?:in )?(?:trying|fighting|resisting|voting|asking|complaining)\b/,
        /\bwhy (?:even )?bother\b/,
        /\byou can't (?:fight|beat|change) (?:it|them|the system|city hall)\b/
      ]
    },
    {
      id: 'blame-shift', name: 'Blame inversion', vectors: ['belief'], covert: 2, weight: 3, capture: false,
      does: 'Moves responsibility for an act onto the person it was done to. Includes the apology that apologizes for your feelings instead of the act.',
      question: 'Who actually acted here? Return the responsibility to the person who did it.',
      patterns: [
        /\b(?:you made me|look what you made me do|this is (?:all )?your (?:own )?fault|you brought this on yourself|you asked for (?:it|this))\b/,
        /\bif you hadn't\b/,
        /\bi'm sorry (?:you feel|you felt|if you (?:feel|felt|were|got)|but you)\b/,
        /\bi apologi[sz]e if (?:you|anyone) (?:were|was|felt|took)\b/
      ]
    },
    {
      id: 'fear-relief', name: 'Fear-then-relief', vectors: ['action', 'belief'], covert: 2, weight: 2, capture: true,
      requires: { ids: ['threat', 'dehumanization', 'urgency'], window: 2 },
      does: 'Raises a threat, then immediately offers the speaker\'s solution as relief. You comply with the relief — but the fear did the persuading.',
      question: 'Is the solution judged on its merits, or on how much relief it gives from a fear this same text created? Who benefits from you feeling this right now?',
      patterns: [
        /\b(?:the good news|fortunately|luckily|thankfully|but there(?:'s| is) (?:a way|hope|a solution|good news)|the (?:simple |easy |only )?(?:fix|answer|solution|cure|antidote) is|all you (?:have|need) to do|here's how to (?:protect|stay safe|fix|survive)|that's (?:why|where) (?:we|i|our \w+|this \w+) (?:come|comes|came|built|created|exists?)|that's why i (?:built|created|made))\b/
      ]
    },
    // --- Lexical operators: the Errorfect operator taxonomy (White Paper §8.2) ---
    // Words that have drifted from describing a state of affairs to installing one.
    // Each has a mask (the socially wearable surface) and a mechanism (the regulatory work below awareness).
    {
      id: 'op-standard', layer: 'lexical', name: 'Standard-installer', vectors: ['belief', 'thought'], covert: 2, weight: 1, capture: false,
      mask: 'a description of quality', mechanism: 'installs an unspoken, unmeasured, often impossible benchmark and converts every deviation into deficiency',
      does: 'Installs a hidden standard: unspoken, typically unmeasured, frequently impossible. Any deviation from the phantom benchmark becomes deficiency, paid for in shame, delay and self-censorship.',
      question: 'What hidden standard is being assumed — and who authored it?',
      patterns: [
        /\b(?:perfect(?:ly|ion|ionism)?|flawless(?:ly)?|excellent|excellence|adequate(?:ly)?|exceeds expectations|meets expectations|needs improvement|world-class|best-in-class|enough|proper(?:ly)?|worthy|deserve[sd]?)\b/,
        /\bgood (?:person|people|parent|mother|father|man|woman|citizen|employee|wife|husband|christian|daughter|son|enough)\b/
      ]
    },
    {
      id: 'op-sorting', layer: 'lexical', name: 'Sorting-rule enforcer', vectors: ['belief'], covert: 2, weight: 1, capture: false,
      mask: 'a statistical or descriptive term', mechanism: 'manufactures an invisible center and treats everything outside it as defective',
      does: 'Presents a verdict as a description. It manufactures an invisible center, then treats anything outside that center as wrong rather than different. If no one can name the units, it is doing social control work, not truth work.',
      question: 'Normal for whom, in what context, by what metric?',
      patterns: [
        /\b(?:normal(?:ly|cy)?|abnormal|typical(?:ly)?|atypical|standard|non-?standard|appropriate|inappropriate|acceptable|unacceptable|compliant|non-?compliant|non-?conforming|conform(?:ing)?|culture fit|not a (?:good )?fit|regular people|ordinary people|mainstream|fringe|weird|deviant|unnatural)\b/
      ]
    },
    {
      id: 'op-threat', layer: 'lexical', name: 'Threat-coder', vectors: ['action', 'thought'], covert: 2, weight: 1, capture: false,
      mask: 'competence or mastery', mechanism: 'encodes fear; promises command over systems that respond to influence, not command',
      does: 'Frames fear as competence. It promises mastery over complex systems that respond to influence but not to command, and charges a toll in attention, flexibility, sleep and tenderness.',
      question: 'Swap the verb: control → influence. What one lever can actually be pulled right now?',
      patterns: [
        /\b(?:control(?:led|ling|s)?|uncontrollable|out of control|(?:under|get|take|keep|regain|lose|lost) control|in charge|handle (?:it|this|yourself|things)|keep it together|hold it together|manage (?:your|their|his|her|my) (?:emotions|feelings|anger|anxiety|weight|reactions|behavior)|self-control|discipline(?:d)?|on top of (?:it|things|everything))\b/
      ]
    },
    {
      id: 'op-identity', layer: 'lexical', name: 'Identity-fuser', vectors: ['belief', 'action'], covert: 3, weight: 1, capture: false,
      mask: 'a role or a compliment', mechanism: 'fuses the reader with a role so its demands feel like who they are',
      does: 'Fuses a person with a role-word until they cannot tell themselves apart from its payload. The role\'s demands then feel like identity, and falling short feels like self-betrayal.',
      question: 'Is this describing what someone does, or assigning what they are?',
      patterns: [
        /\b(?:professional(?:ism)?|unprofessional|leadership material|a (?:natural |born )?leader|team player|high performer|rock ?star|a creative|creatives|hustler|go-getter|self-starter|grown-?up|mature|immature|responsible|irresponsible|lazy|selfish|resilient|a winner|a loser)\b/
      ]
    },
    {
      id: 'op-metric', layer: 'lexical', name: 'Metric-concealer', vectors: ['belief', 'action'], covert: 2, weight: 1, capture: false,
      mask: 'a measurement', mechanism: 'pretends to measure but never states its units, so the target can move indefinitely',
      does: 'Sounds like a measurement but never states its units, its finish line, or who keeps score — so the goal can be moved forever.',
      question: 'Show the units. Measured how, against what, judged by whom?',
      patterns: [
        /\b(?:effective(?:ly|ness)?|ineffective|efficien(?:t|tly|cy)|inefficient|productiv(?:e|ity)|unproductive|success(?:ful|fully)?|unsuccessful|optimal|optimi[sz]ed?|high-?performing|underperform(?:ing|ance)?|healthy|unhealthy|realistic|unrealistic|impact(?:ful)?|value-?add(?:ed)?|best practices?)\b/
      ]
    },
    {
      id: 'self-verdict', layer: 'lexical', name: 'Shame verdict', vectors: ['belief'], covert: 2, weight: 2, capture: false,
      mask: 'honest self-assessment', mechanism: 'turns an event into a permanent property of the person',
      does: 'Converts an event into an identity — the grammar moves a verb about outcomes into a noun about a person.',
      question: 'Keep it a verb, with a date: what happened, and when?',
      patterns: [
        /\b(?:not|never|isn't|aren't|wasn't|weren't) (?:good |smart |thin |strong |rich |fast |pretty |young |old )?enough\b/,
        /\b(?:never be|will never be|can never be) (?:enough|good enough|worthy|loved)\b/
      ]
    },
    {
      id: 'obligation', name: 'Obligation injection', vectors: ['action'], covert: 1, weight: 1, capture: true,
      does: 'Issues a duty with no named creditor. The modal verb carries authority the sentence never earns.',
      question: 'Who issued this obligation, and when did you sign?',
      patterns: [
        /\b(?:you|we|they|people|everyone|one) (?:really |absolutely |simply |just )?(?:should|must|need to|have to|ought to|are supposed to|had better|'d better|have got to|gotta)\b/,
        /\bit(?:'s| is) (?:time|your duty|our duty|your responsibility|essential|imperative|crucial|vital|non-negotiable) (?:to|that|for)\b/
      ]
    },
    {
      id: 'consensus', name: 'Manufactured consensus', vectors: ['belief'], covert: 2, weight: 2, capture: true,
      does: 'Presents a claim as already settled by a crowd that is never counted, so disagreeing feels like leaving the group.',
      question: 'Who exactly is "everyone"? Can the count be shown?',
      patterns: [
        /\b(?:everyone|everybody|all of us|we all|most people|any reasonable person|any sane person|anyone with a brain|no one|nobody) (?:knows?|agrees?|understands?|can see|believes?|wants?|realizes?|admits?|denies)\b/,
        /\bit(?:'s| is) (?:common (?:sense|knowledge)|obvious|clear|well[- ]known|no secret|undeniable|a (?:simple )?fact|self-evident)\b/,
        /\b(?:obviously|clearly|of course|undeniably|unquestionably|needless to say|as we all know|as everyone knows|let's be honest|let's face it|we can all agree|make no mistake)\b/
      ]
    },
    {
      id: 'agent-deletion', name: 'Agent deletion', vectors: ['thought'], covert: 3, weight: 1, capture: false,
      does: 'Removes the actor from the sentence. Things "were decided" and "were lost" — responsibility evaporates and there is no one left to question.',
      question: 'Who did this? Put the actor back in the sentence.',
      patterns: [
        /\bmistakes were made\b/,
        /\bit (?:is|was|has been|had been) (?:\w+ly )?(?:said|believed|thought|reported|decided|determined|felt|known|understood|agreed|suggested|alleged|recommended|deemed|noted)\b/,
        /\b(?:was|were|has been|have been|had been|is being|are being|will be) (?:\w+ly )?(?:decided|determined|deemed|taken|lost|killed|harmed|hurt|believed|considered|mandated|implemented|eliminated|removed|terminated|let go|impacted|affected|cut|discontinued)\b(?! by\b)/
      ]
    },
    {
      id: 'identity', name: 'Identity capture', vectors: ['belief', 'action'], covert: 3, weight: 3, capture: true,
      does: 'Converts behavior into identity. Once a position is fused to who you are, doubting it feels like self-betrayal — and compliance feels like being yourself.',
      question: 'Is this describing what you did, or assigning what you are?',
      patterns: [
        /\byou(?:'re| are) (?:the (?:kind|type|sort) of (?:person|people|woman|man)|a (?:true|real))\b/,
        /\b(?:people|those|men|women|folks|guys) like (?:us|you|them|that)\b/,
        /\b(?:real|true) (?:men|women|man|woman|patriots?|believers?|fans?|friends?|leaders?|artists?|christians?|americans?|entrepreneurs?|warriors?|creators?|members?)\b/,
        /\bif you(?:'re| are) (?:a )?(?:true|real|serious|smart|good|decent)\b/,
        /\b(?:i|you|he|she|they)(?:'m|'re| am| are| is) (?:just |such |nothing but |only |a total |an utter )?(?:a |an )?(?:failure|loser|disappointment|burden|mess|fraud|nobody|idiot|coward|waste)\b/,
        /\bthat(?:'s| is) (?:just )?who (?:you|we|i) (?:are|am)\b/,
        /\b(?:as a|being a) (?:mother|father|parent|man|woman|christian|patriot|leader|professional|member),? you\b/
      ]
    },
    {
      id: 'binary', name: 'False binary', vectors: ['thought'], covert: 2, weight: 2, capture: true,
      does: 'Collapses the option space to two doors, one of them unacceptable. The third option is never mentioned, so it never gets considered.',
      question: 'Name a third option. Then a fourth.',
      patterns: [
        /\beither (?:you|we|they|this|it)\b[^.!?\n]{0,80}?\bor\b/,
        /\b(?:the only (?:way|option|choice|solution|answer|path|hope|thing)|no (?:other )?(?:alternative|choice|option)|there (?:is|are) only two)\b/,
        /\b(?:with us or against us|part of the (?:problem|solution)|now or never|all or nothing)\b/,
        /\bif you (?:don't|do not|won't|will not|aren't|are not|can't)\b[^.!?\n]{0,60}?\b(?:you(?:'ll| will)|then)\b/
      ]
    },
    {
      id: 'urgency', name: 'Urgency and scarcity', vectors: ['action'], covert: 1, weight: 2, capture: true,
      does: 'Shrinks the time available for deliberation. Pressure substitutes for reasons — the clock argues so the claim does not have to.',
      question: 'What happens if you wait a week? Who benefits from you not thinking it over?',
      patterns: [
        /\b(?:act|order|buy|join|sign up|enroll|register|call|decide|hurry|apply|book|claim) (?:now|today|immediately|fast|right away|before)\b/,
        /\b(?:before it's too late|time is running out|running out of time|last chance|limited time|while (?:supplies|you still can)|don't (?:wait|delay|miss out|hesitate)|ticking|countdown|expires? (?:soon|tonight|today|at midnight)|the (?:window|door) is closing|this won't last|spots are filling|almost gone|final hours)\b/,
        /\bonly \d+ (?:left|remaining|spots?|seats?|places?|copies)\b/
      ]
    },
    {
      id: 'threat', name: 'Threat coding', vectors: ['belief', 'action'], covert: 1, weight: 2, capture: false,
      does: 'Primes the threat system. A frightened reader narrows attention and defers to whoever offers safety.',
      question: 'What is the actual probability and size of this harm, stated with a source?',
      patterns: [
        /\b(?:crisis|catastroph\w*|disaster|collapse[sd]?|destroy\w*|annihilat\w*|under attack|invasion|threaten\w*|deadly|existential|apocalyp\w*|doom\w*|lose everything|wiped out|they're coming|ruin(?:ed|ing)?|devastat\w*|dangerous|terrifying|frightening|nightmare|afraid)\b/
      ]
    },
    {
      id: 'dehumanization', name: 'Dehumanization', vectors: ['belief', 'thought'], covert: 2, weight: 3, capture: false,
      does: 'Recodes people as vermin, disease, or swarm. It switches off empathy so harsher conclusions feel proportionate.',
      question: 'Replace the metaphor with "people". Does the sentence still hold?',
      patterns: [
        /\b(?:vermin|parasites?|subhuman|infestation|infest(?:ed|ing)|cockroaches|sheeple)\b/,
        /\b(?:they|them|these people|those people)(?:'re| are)? (?:like )?(?:animals|rats|a cancer|a disease|a plague|a virus|a swarm|filth)\b/,
        /\b(?:swarm(?:s|ing)?|flood(?:s|ing)?) (?:of|into|across) (?:our|the) (?:country|streets|neighborhoods?|schools|borders?)\b/
      ]
    },
    {
      id: 'partition', name: 'Us/them partition', vectors: ['belief'], covert: 2, weight: 2, capture: false,
      does: 'Splits the world into an in-group and a faceless out-group. Claims then get judged by which side says them.',
      question: 'Who exactly is "they"? Name one, and ask what they would say.',
      patterns: [
        /\b(?:those people|these people|the elites?|the establishment|the enemy|the other side|people like that|their kind|outsiders|the mainstream|the powers that be|the haters)\b/
      ],
      cooccur: true // also fires on sentences that contain both we/us/our and they/them/their
    },
    {
      id: 'invalidation', name: 'Perception invalidation', vectors: ['thought'], covert: 2, weight: 3, capture: false,
      does: 'Tells you your perception is defective. If your own read of events can\'t be trusted, the speaker\'s version wins by default.',
      question: 'What is being shrunk — and what would its real size be if you trusted your own read?',
      patterns: [
        /\byou(?:'re| are) (?:over ?reacting|too sensitive|being (?:dramatic|hysterical|paranoid|irrational|emotional)|imagining (?:things|it)|crazy|remembering it wrong|making (?:this|it) up)\b/,
        /\b(?:calm down|lighten up|get over it|that never happened|it was just a joke|can't you take a joke)\b/,
        /\bit(?:'s| is| was) (?:not (?:a|that) big (?:of a )?deal|nothing|no big deal)\b/
      ]
    },
    {
      id: 'minimizer', name: 'Cost minimizer', vectors: ['action'], covert: 2, weight: 1, capture: true,
      does: 'Shrinks the perceived size of what is being asked so the ask slips under scrutiny.',
      question: 'Say the full cost out loud — money, time, exit terms.',
      patterns: [
        /\b(?:just|simply|merely|only) (?:a |an |the )?(?:small|little|tiny|quick|one-time|modest|token) (?:fee|price|payment|investment|cost|charge|commitment|step|favor|ask|deposit|amount)\b/,
        /\b(?:less than|under) (?:the (?:price|cost) of )?(?:a|one) (?:coffee|latte|lunch|pizza|day)\b/
      ]
    },
    {
      id: 'terminator', name: 'Thought-terminating cliché', vectors: ['thought'], covert: 2, weight: 2, capture: false,
      does: 'Ends inquiry with a phrase that sounds wise. The question it closes never gets asked again.',
      question: 'What question did this phrase just end? Ask it anyway.',
      patterns: [
        /\b(?:it is what it is|everything happens for a reason|that's (?:just )?(?:how|the way) (?:it is|things are|the world works)|don't overthink (?:it|this)|trust the process|boys will be boys|agree to disagree|let's not go there|who's to say|you'll understand when you're older|because i said so|end of (?:story|discussion)|case closed|the science is settled|good vibes only|stop asking questions|it's (?:all )?(?:god's plan|part of the plan)|you just have to believe|don't question it)\b/
      ]
    },
    {
      id: 'authority', name: 'Borrowed authority', vectors: ['belief'], covert: 2, weight: 2, capture: true,
      does: 'Rents credibility from an unnamed expert or study. The authority is invoked but never produced.',
      question: 'Which expert, which study, which year? Can you open it?',
      patterns: [
        /\b(?:experts?|scientists?|doctors?|studies|research|science|sources|insiders|officials|analysts|scholars|psychologists|economists) (?:say|says|agree|show|shows|prove|proves|confirm|confirms|recommend|suggest|have (?:shown|found|proven|confirmed))\b/,
        /\baccording to (?:sources|experts|insiders|reports|some)\b/,
        /\bit(?:'s| is| has been) (?:scientifically |clinically )?proven\b/
      ]
    },
    {
      id: 'suggestion', name: 'Embedded suggestion', vectors: ['thought', 'action'], covert: 3, weight: 2, capture: true,
      does: 'Installs an experience instead of making a claim — you are walked through feeling or imagining the outcome before deciding on it.',
      question: 'What experience is this text trying to install in you, and did you agree to it?',
      patterns: [
        /\b(?:imagine (?:yourself|how|what|a world|waking)|picture (?:yourself|this|how))\b/,
        /\byou(?:'ll| will| may| might| can) (?:begin|start) to (?:notice|feel|realize|see|wonder|sense)\b/,
        /\b(?:you might find yourself|as you (?:read|sit|breathe|listen|continue|scroll)|notice how|allow yourself to|let yourself)\b/
      ]
    },
    {
      id: 'inevitability', name: 'Manufactured inevitability', vectors: ['belief'], covert: 2, weight: 2, capture: true,
      does: 'Frames an outcome as already decided by history, so resisting it feels futile and joining it feels like foresight.',
      question: 'Who benefits from this feeling inevitable? What would stop it?',
      patterns: [
        /\b(?:inevitabl[ey]|only a matter of time|there's no stopping|the future belongs to|history will (?:judge|remember|show|vindicate)|the right side of history|resistance is futile|whether you like it or not|like it or not|the writing is on the wall|the tide (?:is turning|has turned)|it's (?:already )?happening)\b/
      ]
    },
    {
      id: 'guilt', name: 'Guilt and debt leverage', vectors: ['action'], covert: 2, weight: 3, capture: true,
      does: 'Turns a request into an invoice. Refusing stops being a choice and becomes a default on a debt you never agreed to.',
      question: 'Is this a request or an invoice? What happens if you simply say no?',
      patterns: [
        /\bafter (?:all|everything) (?:i've|we've|i have|we have|i|we) (?:done|given|sacrificed|did)\b/,
        /\byou owe (?:me|us|it to)\b/,
        /\bthe least you (?:can|could) do\b/,
        /\bif you (?:really|truly) (?:cared|loved|wanted|believed|supported)\b/,
        /\b(?:don't you (?:care|love)|how could you|think of (?:the children|your family|your kids))\b/,
        /\bi (?:sacrificed|gave up) (?:everything|so much)\b/,
        /\byou(?:'re| are) letting (?:everyone|us|me|them|your family) down\b/
      ]
    },
    {
      id: 'absolute', name: 'Absolutes', vectors: ['belief'], covert: 1, weight: 1, capture: false,
      does: 'Universalizes a pattern so exceptions disappear. One counterexample would break it, which is why none are offered.',
      question: 'Count the exceptions.',
      patterns: [
        /\b(?:always|never|everyone|everybody|no one|nobody|every single|completely|totally|entirely|absolutely|100 ?%|all the time|without exception)\b/
      ]
    },
    {
      id: 'euphemism', name: 'Euphemistic anesthesia', vectors: ['thought'], covert: 3, weight: 2, capture: false,
      does: 'Sanitizes a harm with clinical language so it can be processed without being felt.',
      question: 'Say it plainly. What physically happens, and to whom?',
      patterns: [
        /\b(?:collateral damage|right-?siz\w*|downsiz\w*|workforce (?:reduction|optimization|realignment)|restructur\w*|streamlin\w*|neutraliz\w*|pacification|enhanced interrogation|negative (?:growth|outcome|patient outcome)|alternative facts|friendly fire|ethnic cleansing|final solution|re-?education|regime change|kinetic (?:action|activity|operations?)|surgical strikes?|revenue enhancement|involuntary separation|sunsett?ing|transition(?:ed|ing)? (?:out|off)|let go|reduction in force|synerg\w*|efficiencies)\b/
      ]
    },
    {
      id: 'leading', name: 'Leading question', vectors: ['belief'], covert: 2, weight: 2, capture: true,
      does: 'Asks a question whose only acceptable answer is built in. You supply the conclusion yourself, so it feels like your own.',
      question: 'Answer it honestly. Does the text leave room for "no"?',
      patterns: [
        /\b(?:isn't it (?:obvious|clear|time|strange|funny|interesting|curious)|don't you (?:think|agree|see|find|want)|wouldn't you (?:agree|say|want|rather)|who (?:could|would|can) (?:argue|disagree|deny|blame|resist)|why would anyone|can we really trust|are we (?:really )?supposed to believe|what (?:kind of|sort of) (?:person|people|parent|leader|friend))\b/
      ]
    },
    {
      id: 'flattery', name: 'Flattery hook', vectors: ['belief'], covert: 3, weight: 3, capture: true,
      does: 'Prices agreement as intelligence. Doubting the message now means being one of the "others" you were just flattered above.',
      question: 'Is agreement being priced as intelligence? Would a smart person be allowed to disagree?',
      patterns: [
        /\b(?:smart|intelligent|wise|discerning|savvy|awake|enlightened|sharp|ambitious|high-value) (?:people|readers?|folks|ones?|men|women) (?:like you|know|understand|see)\b/,
        /\byou(?:'re| are) not like (?:the )?(?:others|everyone else|most people)\b/,
        /\b(?:only|very) (?:a )?few (?:people )?(?:understand|know|see|realize|get|are ready)\b/,
        /\byou(?:'re| are) (?:one of the )?(?:few|chosen|awake|awakened|ready)\b/,
        /\b(?:you see what others (?:can't|don't|won't)|unlike (?:the )?(?:sheep|masses|herd|normies)|you already know)\b/
      ]
    },
    {
      id: 'insinuation', name: 'Deniable insinuation', vectors: ['belief'], covert: 3, weight: 3, capture: true,
      does: 'Plants a claim without owning it. The reader assembles the accusation, so the speaker never has to defend it.',
      question: 'What claim is being made without being owned? Ask the speaker to state it plainly.',
      patterns: [
        /\bi'm (?:just|only) asking(?: questions)?\b/,
        /\b(?:some|many) (?:people )?(?:are saying|say|believe|wonder|claim|suspect)\b/,
        /\bpeople are (?:saying|talking|starting to wonder)\b/,
        /\bi'm not saying\b[^.!?\n]{0,40}?\bbut\b/,
        /\b(?:makes? you (?:wonder|think)|coincidence\?|draw your own conclusions?|do your own research|connect the dots|just saying|you do the math)\b/,
        /\bwhat (?:are they|is (?:he|she|it)) (?:hiding|not telling)\b/,
        /\bwhat they (?:don't|do not|won't|will not) (?:want you to know|tell you)\b/,
        /\bit(?:'s| is) (?:interesting|curious|strange|funny|telling) (?:that|how)\b/
      ]
    },
    {
      id: 'moral', name: 'Moral loading', vectors: ['belief'], covert: 2, weight: 1, capture: false,
      does: 'Substitutes a moral verdict for an argument. Purity and disgust words make a position feel clean or contaminated before it is examined.',
      question: 'Is a moral verdict standing in for evidence? What is the factual claim underneath?',
      patterns: [
        /\b(?:evil|wicked|corrupt\w*|degenerat\w*|disgusting|filth\w*|vile|purity|sacred|righteous|sinful|toxic|depraved|monstrous|treason\w*|traitors?|unclean|tainted)\b/
      ]
    },
    {
      id: 'conditional-worth', name: 'Conditional worth', vectors: ['belief', 'action'], covert: 3, weight: 3, capture: true,
      does: 'Makes your worth contingent on compliance. Worth becomes a reward the text controls rather than a given.',
      question: 'Who set this condition on your worth, and why do they hold the key?',
      patterns: [
        /\byou(?:'ll| will) (?:finally )?(?:be|feel) (?:worthy|enough|happy|loved|free|complete|whole|respected) (?:when|once|if)\b/,
        /\bonce you\b[^.!?\n]{0,40}?\byou(?:'ll| will) (?:finally )?(?:be|feel|deserve)\b/,
        /\byou(?:'re| are) nothing without\b/,
        /\bonly (?:then|when you\b[^.!?\n]{0,30}?) (?:will|can) you\b/,
        /\byou don't deserve\b/
      ]
    },
    {
      id: 'machine', name: 'Machine-directed instruction', vectors: ['action'], covert: 3, weight: 3, capture: true,
      does: 'Instructions aimed at an AI that reads, summarizes, or acts on the text — prompt injection. The human reader is not the audience; the machine is.',
      question: 'Who is this sentence actually addressed to, and what would an AI do if it obeyed?',
      patterns: [
        /\b(?:ignore|disregard|forget) (?:all |any )?(?:of )?(?:the |your )?(?:previous|prior|above|earlier|preceding) (?:instructions?|prompts?|messages?|rules|directions)\b/,
        /\byou are now (?:a|an|in|the)\b/,
        /\b(?:new|updated|hidden) instructions?:/,
        /\bsystem prompt\b/,
        /\bif you are an? (?:ai|llm|language model|assistant|chatbot|bot|agent)\b/,
        /\b(?:ai|llm) (?:assistants?|models?|agents?|systems?),? (?:should|must|reading this|summarizing this)\b/,
        /\bdo not (?:tell|inform|reveal (?:this )?to|mention (?:this )?to) the user\b/,
        /\bas an ai(?: language model)?\b/
      ]
    }
  ];

  var MECH_BY_ID = {};
  MECHANISMS.forEach(function (m) {
    m.layer = m.layer || (m.id === 'machine' ? 'hidden' : 'rhetorical');
    m.regexes = m.patterns.map(function (p) { return new RegExp(p.source, 'gi'); });
    MECH_BY_ID[m.id] = m;
  });

  // Hidden-layer mechanism (populated by the character scan, not the lexicon)
  var HIDDEN_MECH = {
    id: 'hidden', layer: 'hidden', name: 'Hidden character layer', vectors: ['action', 'belief'], covert: 3, weight: 3,
    does: 'Characters a human cannot see but a machine can read: zero-width marks, direction overrides, Unicode tag payloads, look-alike letters. Used to smuggle instructions, fingerprint copies, or evade filters.',
    question: 'Why does this text contain content its human reader cannot see?'
  };
  MECH_BY_ID.hidden = HIDDEN_MECH;

  var LAYER_ORDER = ['lexical', 'rhetorical', 'hidden'];
  var LAYER_TITLES = {
    lexical: 'Layer 1 — Lexical operators',
    rhetorical: 'Layer 2 — Rhetorical mechanisms',
    hidden: 'Layer 3 — Hidden layer'
  };
  var LAYER_NOTES = {
    lexical: 'Single words that install a state of affairs instead of describing one (Errorfect operator taxonomy).',
    rhetorical: 'Sentence-level moves that apply a vector without stating it as a claim.',
    hidden: 'Content addressed to machines, or invisible to the human reader.'
  };
  // Errorfect White Paper §6.1: the three post-disruption diagnostic questions
  var CONSENT_QUESTIONS = [
    'What hidden standard is being assumed?',
    'Who authored that standard — me, culture, an institution, fear?',
    'Do I consent to operating under it right now?'
  ];

  var EPISTEMIC_NOTE = 'Signals, not verdicts. Undertow detects mechanisms, not intent; many of these moves are also used innocently, and persuasion is not manipulation by default. The point is visibility, not censorship: the question is whether the push is visible and whether you consent to it. Rule-based detection misses paraphrase and over-flags some ordinary usage.';

  var VECTOR_LABELS = {
    belief: 'Belief — what you are being moved to accept as true',
    action: 'Action — what you are being moved to do',
    thought: 'Thought — how your thinking is being shaped or shut down'
  };

  // ---------------------------------------------------------------------------
  // Text preparation
  // ---------------------------------------------------------------------------
  var CONFUSABLES = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ѕ': 's', 'ј': 'j', 'ԁ': 'd', 'ɡ': 'g', 'һ': 'h', 'ӏ': 'l',
    'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'І': 'I',
    'ο': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'ν': 'v', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Χ': 'X', 'Υ': 'Y', 'Ζ': 'Z'
  };
  var PUNCT_FOLD = { '‘': "'", '’': "'", 'ʼ': "'", '“': '"', '”': '"', '–': '-', '—': '-', ' ': ' ' };

  function isInvisibleCode(cp) {
    return (cp >= 0x200B && cp <= 0x200F) || cp === 0x2060 || cp === 0x2061 || cp === 0x2062 || cp === 0x2063 || cp === 0x2064 ||
      cp === 0xFEFF || cp === 0x00AD || cp === 0x180E ||
      (cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2066 && cp <= 0x2069) ||
      (cp >= 0xFE00 && cp <= 0xFE0F) || (cp >= 0xE0000 && cp <= 0xE007F) || (cp >= 0xE0100 && cp <= 0xE01EF);
  }

  // Build a scan copy: invisible characters removed, quotes and look-alikes folded.
  // map[i] = index in the original string of scan-copy character i.
  function prepare(text) {
    var out = [], map = [];
    for (var i = 0; i < text.length; i++) {
      var cp = text.codePointAt(i);
      var len = cp > 0xFFFF ? 2 : 1;
      if (!isInvisibleCode(cp)) {
        var ch = text.slice(i, i + len);
        var folded = PUNCT_FOLD[ch] || CONFUSABLES[ch] || ch;
        for (var k = 0; k < folded.length; k++) { out.push(folded[k]); map.push(i); }
      }
      i += len - 1;
    }
    map.push(text.length);
    return { scan: out.join(''), map: map };
  }

  function stripMarkup(src) {
    return String(src)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(?:br|\/p|\/div|\/h\d|\/li|\/tr)\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCodePoint(+n); })
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();
  }

  var STOP = toSet('a an the and or but if of to in on at by for with from as is are was were be been being it its this that these those i you he she we they me him her us them my your his our their not no so do does did have has had will would can could should may might just than then there here what which who whom whose when where why how all any each very also into about over out up down more most such only own same too s t don isn aren wasn weren won wouldn couldn shouldn re ve ll d m');
  function toSet(s) { var o = {}; s.split(' ').forEach(function (w) { o[w] = 1; }); return o; }

  function tokenize(scan) {
    var toks = [], re = /[a-z0-9]+(?:'[a-z]+)?/gi, m;
    while ((m = re.exec(scan))) toks.push({ w: m[0].toLowerCase(), i: m.index });
    return toks;
  }

  function sentenceStarts(scan) {
    var starts = [0], re = /[.!?]+["')\]]*\s+|\n{2,}|\n(?=\s*[-*•\d])/g, m;
    while ((m = re.exec(scan))) starts.push(m.index + m[0].length);
    return starts;
  }
  function sentenceAt(starts, pos) {
    var lo = 0, hi = starts.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return lo;
  }

  function captureTarget(scan, from) {
    var rest = scan.slice(from, from + 220);
    var m = rest.match(/^[^.!?;\n]*/);
    var t = (m ? m[0] : '').replace(/^[\s,:\-"']+/, '').replace(/^(?:that|is|are|was)\s+/i, '');
    var words = t.split(/\s+/).filter(Boolean);
    if (words.length < 2) return '';
    var clipped = words.slice(0, 14).join(' ');
    return words.length > 14 ? clipped + '…' : clipped;
  }

  // ---------------------------------------------------------------------------
  // Hidden layer scan (original text, not the scan copy)
  // ---------------------------------------------------------------------------
  function hiddenScan(text) {
    var findings = [], hits = [];
    var counts = { zeroWidth: 0, bidi: 0, tag: 0, variation: 0 };
    var tagRun = null, vsRun = null;

    function flushTag(endIdx) {
      if (!tagRun) return;
      var decoded = tagRun.chars.join('');
      findings.push({ kind: 'tag-payload', start: tagRun.start, end: endIdx, count: tagRun.chars.length, decoded: decoded,
        note: 'Invisible Unicode tag characters spelling out text. This is a known technique for smuggling instructions to AI systems.' });
      hits.push({ id: 'hidden', start: tagRun.start, end: endIdx, match: '[hidden: ' + tagRun.chars.length + ' tag chars]', target: decoded.slice(0, 160) });
      tagRun = null;
    }
    function flushVs(endIdx) {
      if (!vsRun) return;
      if (vsRun.n >= 3) {
        findings.push({ kind: 'variation-run', start: vsRun.start, end: endIdx, count: vsRun.n,
          note: 'A run of variation selectors. Normal emoji use one at a time; long runs can encode hidden bytes.' });
        hits.push({ id: 'hidden', start: vsRun.start, end: endIdx, match: '[hidden: ' + vsRun.n + ' variation selectors]', target: '' });
      }
      vsRun = null;
    }

    for (var i = 0; i < text.length; i++) {
      var cp = text.codePointAt(i), len = cp > 0xFFFF ? 2 : 1;
      if (cp >= 0xE0000 && cp <= 0xE007F) {
        counts.tag++;
        if (!tagRun) tagRun = { start: i, chars: [] };
        if (cp >= 0xE0020 && cp <= 0xE007E) tagRun.chars.push(String.fromCharCode(cp - 0xE0000));
      } else flushTag(i);

      if ((cp >= 0xFE00 && cp <= 0xFE0F) || (cp >= 0xE0100 && cp <= 0xE01EF)) {
        counts.variation++;
        if (!vsRun) vsRun = { start: i, n: 0 };
        vsRun.n++;
      } else flushVs(i);

      if ((cp >= 0x200B && cp <= 0x200F) || (cp >= 0x2060 && cp <= 0x2064) || cp === 0xFEFF || cp === 0x180E) {
        counts.zeroWidth++;
        var inWord = i > 0 && /\w/.test(text[i - 1]) && /\w/.test(text[i + len] || '');
        if (inWord) {
          findings.push({ kind: 'zero-width-in-word', start: i, end: i + len, count: 1,
            note: 'A zero-width character inside a word. It can break keyword filters or watermark a copy.' });
          hits.push({ id: 'hidden', start: i, end: i + len, match: '[zero-width U+' + cp.toString(16).toUpperCase() + ']', target: '' });
        }
      }
      if ((cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2066 && cp <= 0x2069)) {
        counts.bidi++;
        findings.push({ kind: 'bidi-control', start: i, end: i + len, count: 1,
          note: 'A text-direction override. It can make text display in a different order than it is stored and read by machines.' });
        hits.push({ id: 'hidden', start: i, end: i + len, match: '[direction override U+' + cp.toString(16).toUpperCase() + ']', target: '' });
      }
      i += len - 1;
    }
    flushTag(text.length); flushVs(text.length);

    // Mixed-script words (Latin letters alongside Cyrillic/Greek look-alikes)
    var wordRe = /[A-Za-zͰ-ϿЀ-ӿ]+/g, m;
    while ((m = wordRe.exec(text))) {
      var w = m[0];
      if (/[A-Za-z]/.test(w) && /[Ͱ-ϿЀ-ӿ]/.test(w)) {
        var latin = w.split('').map(function (c) { return CONFUSABLES[c] || c; }).join('');
        findings.push({ kind: 'mixed-script', start: m.index, end: m.index + w.length, count: 1, decoded: latin,
          note: 'A word mixing Latin with Cyrillic/Greek look-alike letters. It reads as "' + latin + '" but will not match "' + latin + '" in search or filters.' });
        hits.push({ id: 'hidden', start: m.index, end: m.index + w.length, match: w, target: 'reads as "' + latin + '"' });
      }
    }

    var zwTotal = counts.zeroWidth;
    if (zwTotal >= 8 && !findings.some(function (f) { return f.kind === 'zero-width-in-word'; })) {
      findings.push({ kind: 'zero-width-density', start: 0, end: 0, count: zwTotal,
        note: zwTotal + ' zero-width characters are scattered through the text. This density suggests watermarking or an encoded message.' });
    }
    return { findings: findings, hits: hits, counts: counts };
  }

  // ---------------------------------------------------------------------------
  // Main analysis
  // ---------------------------------------------------------------------------
  function analyze(text, opts) {
    opts = opts || {};
    text = String(text || '');
    var prep = prepare(text);
    var scan = prep.scan, map = prep.map;
    var toks = tokenize(scan);
    var words = toks.length;
    var starts = sentenceStarts(scan);
    var sentences = Math.max(1, starts.filter(function (s, i) { return i === 0 || s < scan.length; }).length);

    function toOrig(s, e) { return [map[s], e > 0 ? map[e - 1] + 1 : 0]; }

    var raw = [];
    MECHANISMS.forEach(function (mech) {
      mech.regexes.forEach(function (re) {
        re.lastIndex = 0;
        var m;
        while ((m = re.exec(scan))) {
          if (m[0].length === 0) { re.lastIndex++; continue; }
          var se = m.index + m[0].length;
          var o = toOrig(m.index, se);
          raw.push({
            id: mech.id, start: o[0], end: o[1], scanStart: m.index, scanEnd: se,
            match: text.slice(o[0], o[1]),
            target: mech.capture ? captureTarget(scan, se) : ''
          });
        }
      });
    });

    // Co-occurrence partition: we/us/our and they/them/their in one sentence
    var partition = MECH_BY_ID.partition;
    if (partition.cooccur) {
      for (var si = 0; si < starts.length; si++) {
        var sStart = starts[si], sEnd = si + 1 < starts.length ? starts[si + 1] : scan.length;
        var sent = scan.slice(sStart, sEnd);
        if (/\b(?:we|us|our|ours)\b/i.test(sent)) {
          var tm = /\b(?:they|them|their|theirs)\b/i.exec(sent);
          if (tm) {
            var ss = sStart + tm.index, se2 = ss + tm[0].length, oo = toOrig(ss, se2);
            raw.push({ id: 'partition', start: oo[0], end: oo[1], scanStart: ss, scanEnd: se2, match: text.slice(oo[0], oo[1]), target: '', soft: true });
          }
        }
      }
    }

    // Dedupe: same mechanism, overlapping range -> keep longest
    raw.sort(function (a, b) { return a.start - b.start || (b.end - b.start) - (a.end - a.start); });
    var hits = [];
    var lastByMech = {};
    raw.forEach(function (h) {
      var prev = lastByMech[h.id];
      if (prev && h.start < prev.end) {
        if (h.end - h.start > prev.end - prev.start) { Object.assign(prev, h); }
        return;
      }
      hits.push(h); lastByMech[h.id] = h;
    });

    var hidden = hiddenScan(text);
    hidden.hits.forEach(function (h) { hits.push(h); });
    hits.sort(function (a, b) { return a.start - b.start; });

    hits.forEach(function (h) {
      var mech = MECH_BY_ID[h.id];
      h.name = mech.name;
      h.vectors = mech.vectors;
      h.covert = mech.covert;
      h.layer = mech.layer;
      h.score = mech.weight * (1 + (mech.covert - 1) * 0.5) * (h.soft ? 0.5 : 1);
      h.sentence = sentenceAt(starts, h.scanStart != null ? h.scanStart : 0);
      delete h.scanStart; delete h.scanEnd;
    });

    // Two-beat mechanisms: keep only when the prerequisite mechanism fired within the window
    hits = hits.filter(function (h) {
      var req = MECH_BY_ID[h.id].requires;
      if (!req) return true;
      return hits.some(function (o) {
        return req.ids.indexOf(o.id) !== -1 && o.sentence <= h.sentence && o.sentence >= h.sentence - req.window;
      });
    });

    var convergence = findConvergence(hits, starts, map, text);

    // Aggregates
    var vec = { belief: 0, action: 0, thought: 0 };
    var byMech = {};
    var layers = { lexical: 0, rhetorical: 0, hidden: 0 };
    var pressure = 0, covertPressure = 0;
    hits.forEach(function (h) {
      pressure += h.score;
      if (h.covert >= 3) covertPressure += h.score;
      h.vectors.forEach(function (v) { vec[v] += h.score / h.vectors.length; });
      var b = byMech[h.id] || (byMech[h.id] = { id: h.id, name: h.name, layer: h.layer, count: 0, score: 0, covert: h.covert, vectors: h.vectors, examples: [] });
      layers[h.layer] += h.score;
      b.count++; b.score += h.score;
      if (b.examples.length < 4 && b.examples.indexOf(h.match) === -1) b.examples.push(h.match);
    });

    // Density per 100 words, with a 60-word floor so one phrase in a tiny text can't max the index.
    // Calibrated so a neutral report scores ~0, a euphemistic corporate memo lands in "engineered",
    // and dense sales/recruitment copy lands in "saturated" (see test/run.js).
    var per100 = pressure / (Math.max(words, 60) / 100);
    var pressureIndex = Math.round(100 * (1 - Math.exp(-per100 / 27)));
    if (hidden.findings.some(function (f) { return f.kind === 'tag-payload' || f.kind === 'bidi-control'; })) pressureIndex = Math.max(pressureIndex, 70);
    var covertShare = pressure ? Math.round(100 * covertPressure / pressure) : 0;

    var vTotal = vec.belief + vec.action + vec.thought;
    var vectors = ['belief', 'action', 'thought'].map(function (k) {
      return { kind: k, label: VECTOR_LABELS[k], score: round1(vec[k]), share: vTotal ? Math.round(100 * vec[k] / vTotal) : 0 };
    });
    var dominant = vTotal ? vectors.slice().sort(function (a, b) { return b.score - a.score; })[0].kind : null;

    // Targets: where each vector is pointed
    var targets = { belief: [], action: [], thought: [] };
    var seenT = {};
    hits.forEach(function (h) {
      if (!h.target || h.id === 'hidden') return;
      var key = h.id + '|' + h.target.toLowerCase();
      if (seenT[key]) return; seenT[key] = 1;
      var v = h.vectors[0];
      targets[v].push({ mechanism: h.name, id: h.id, trigger: h.match, target: h.target, start: h.start });
    });

    var mechList = Object.keys(byMech).map(function (k) { var b = byMech[k]; b.score = round1(b.score); return b; })
      .sort(function (a, b) { return b.score - a.score; });

    // Second-person address
    var youCount = toks.filter(function (t) { return t.w === 'you' || t.w === 'your' || t.w === "you're" || t.w === 'yourself' || t.w === "you'll" || t.w === "you've"; }).length;

    // Abstraction density (nominalizations)
    var nomCount = toks.filter(function (t) { return t.w.length > 7 && /(?:tion|sion|ment|ness|ance|ence|ity|ism)s?$/.test(t.w); }).length;

    return {
      version: VERSION,
      words: words,
      sentences: sentences,
      pressureIndex: pressureIndex,
      band: band(pressureIndex),
      covertShare: covertShare,
      dominantVector: dominant,
      vectors: vectors,
      layers: { lexical: round1(layers.lexical), rhetorical: round1(layers.rhetorical), hidden: round1(layers.hidden) },
      convergence: convergence,
      mechanisms: mechList,
      hits: hits,
      targets: targets,
      hidden: hidden.findings,
      hiddenCounts: hidden.counts,
      repetition: repeatedPhrases(toks, 4, 3).slice(0, 8),
      address: { secondPerson: youCount, per100: words ? round1(youCount / (words / 100)) : 0 },
      abstraction: { nominalizations: nomCount, per100: words ? round1(nomCount / (words / 100)) : 0 },
      probes: probes(hits)
    };
  }

  // ψ Influence Mapping interpretation key: "One or two ψ signals = low-level manipulation;
  // awareness advised. Three or more converging vectors = you're inside a ψ architecture."
  // A convergence zone = 3+ distinct mechanisms (lexical operators and absolutes excluded)
  // inside a window of 3 consecutive sentences.
  var CONVERGENCE_WINDOW = 3, CONVERGENCE_MIN = 3;
  function findConvergence(hits, starts, map, text) {
    var textLen = text.length;
    var strong = hits.filter(function (h) { return h.layer !== 'lexical' && h.id !== 'absolute'; });
    var distinctAll = {};
    strong.forEach(function (h) { distinctAll[h.id] = 1; });
    var zones = [];
    var nSent = starts.length;
    for (var s = 0; s < nSent; s++) {
      var inWin = strong.filter(function (h) { return h.sentence >= s && h.sentence < s + CONVERGENCE_WINDOW; });
      var ids = {};
      inWin.forEach(function (h) { ids[h.id] = 1; });
      var k = Object.keys(ids);
      if (k.length < CONVERGENCE_MIN) continue;
      var firstS = Math.min.apply(null, inWin.map(function (h) { return h.sentence; }));
      var lastS = Math.max.apply(null, inWin.map(function (h) { return h.sentence; }));
      var prev = zones[zones.length - 1];
      if (prev && firstS <= prev.lastSentence) {
        prev.lastSentence = Math.max(prev.lastSentence, lastS);
        k.forEach(function (id) { if (prev.ids.indexOf(id) === -1) prev.ids.push(id); });
      } else {
        zones.push({ firstSentence: firstS, lastSentence: lastS, ids: k.slice() });
      }
    }
    zones.forEach(function (z) {
      z.start = map[starts[z.firstSentence]] || 0;
      z.end = z.lastSentence + 1 < starts.length ? map[starts[z.lastSentence + 1]] : textLen;
      var ex = text.slice(z.start, z.end).replace(/\s+/g, ' ').trim();
      z.excerpt = ex.length > 280 ? ex.slice(0, 280) + '…' : ex;
      z.mechanisms = z.ids.map(function (id) { return MECH_BY_ID[id].name; });
      z.count = z.ids.length;
    });
    var distinct = Object.keys(distinctAll).length;
    var level, note;
    if (zones.length) {
      level = 'architecture';
      note = zones.length + ' convergence zone' + (zones.length > 1 ? 's' : '') + ': three or more distinct mechanisms within three sentences. Converging vectors suggest a constructed influence architecture rather than incidental phrasing.';
    } else if (distinct >= 1) {
      level = 'friction';
      note = 'Isolated signals. These are friction points, not alarms: awareness advised, no converging architecture detected.';
    } else {
      level = 'none';
      note = 'No rhetorical mechanisms detected.';
    }
    return { distinctMechanisms: distinct, zones: zones.slice(0, 12), level: level, note: note };
  }

  function band(i) {
    if (i < 20) return { level: 'low', label: 'Low signal', note: 'Mostly description. Few operators are steering the reader.' };
    if (i < 45) return { level: 'ambient', label: 'Ambient pressure', note: 'Ordinary persuasive texture. Some operators are present; check the targets.' };
    if (i < 70) return { level: 'engineered', label: 'Engineered pressure', note: 'Operators cluster and point the same way. The text is built to move you.' };
    return { level: 'saturated', label: 'Saturated', note: 'Dense, coordinated pressure. The text steers harder than it informs.' };
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function ngrams(toks, n) {
    var out = [];
    for (var i = 0; i + n <= toks.length; i++) {
      var g = toks.slice(i, i + n).map(function (t) { return t.w; });
      var content = g.filter(function (w) { return !STOP[w]; }).length;
      if (content >= 2) out.push(g.join(' '));
    }
    return out;
  }

  function repeatedPhrases(toks, n, min) {
    var counts = {};
    ngrams(toks, n).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; });
    return Object.keys(counts).filter(function (g) { return counts[g] >= min; })
      .map(function (g) { return { phrase: g, count: counts[g] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  // Errorfect protocol A on load-bearing words: remove the first letter, see what surfaces.
  function probes(hits) {
    var seen = {}, out = [];
    hits.forEach(function (h) {
      if (h.layer !== 'lexical' && ['moral', 'identity', 'conditional-worth'].indexOf(h.id) === -1) return;
      var words = h.match.toLowerCase().match(/[a-z]{4,}/g) || [];
      words.forEach(function (w) {
        if (STOP[w] || seen[w] || ['people', 'like', 'real', 'true', 'good', 'kind', 'type', 'sort', 'just', 'such', 'only', 'nothing'].indexOf(w) !== -1) return;
        seen[w] = 1;
        out.push({ word: w, fragment: w.slice(1), mechanism: h.name });
      });
    });
    return out.slice(0, 12);
  }

  // ---------------------------------------------------------------------------
  // Highlight segmentation for renderers
  // ---------------------------------------------------------------------------
  function segment(text, hits) {
    var bounds = [0, text.length];
    hits.forEach(function (h) { bounds.push(h.start, h.end); });
    bounds = bounds.filter(function (b, i, a) { return a.indexOf(b) === i; }).sort(function (a, b) { return a - b; });
    var segs = [];
    for (var i = 0; i < bounds.length - 1; i++) {
      var s = bounds[i], e = bounds[i + 1];
      if (e <= s) continue;
      var cover = hits.filter(function (h) { return h.start <= s && h.end >= e; });
      var last = segs[segs.length - 1];
      if (last && sameSet(last.hits, cover)) last.end = e;
      else segs.push({ start: s, end: e, hits: cover });
    }
    return segs;
  }
  function sameSet(a, b) { return a.length === b.length && a.every(function (x) { return b.indexOf(x) !== -1; }); }

  // ---------------------------------------------------------------------------
  // Body of work
  // ---------------------------------------------------------------------------
  function analyzeCorpus(docs) {
    var results = docs.map(function (d) { return { name: d.name, result: analyze(d.text) }; });
    var n = results.length;
    var combined = analyze(docs.map(function (d) { return d.text; }).join('\n\n'));

    // Mechanism signature: present in at least half the documents (and at least 2)
    var presence = {};
    results.forEach(function (r) { r.result.mechanisms.forEach(function (m) { presence[m.id] = (presence[m.id] || 0) + 1; }); });
    var signature = Object.keys(presence).filter(function (id) { return presence[id] >= Math.max(2, Math.ceil(n / 2)); })
      .map(function (id) { return { id: id, name: MECH_BY_ID[id].name, docs: presence[id] }; })
      .sort(function (a, b) { return b.docs - a.docs; });

    // Shared phrasing across documents (talking points)
    var docPhrases = results.map(function (r, i) {
      var set = {};
      ngrams(tokenize(prepare(docs[i].text).scan), 4).forEach(function (g) { set[g] = 1; });
      return set;
    });
    var phraseDocs = {};
    docPhrases.forEach(function (set) { Object.keys(set).forEach(function (g) { phraseDocs[g] = (phraseDocs[g] || 0) + 1; }); });
    var shared = Object.keys(phraseDocs).filter(function (g) { return phraseDocs[g] >= 2; })
      .map(function (g) { return { phrase: g, docs: phraseDocs[g] }; })
      .sort(function (a, b) { return b.docs - a.docs; });
    shared = collapseOverlapping(shared).slice(0, 15);

    // Recurring targets
    var tCount = {};
    results.forEach(function (r) {
      var local = {};
      ['belief', 'action', 'thought'].forEach(function (v) {
        r.result.targets[v].forEach(function (t) {
          var key = v + '|' + t.target.toLowerCase().replace(/…$/, '').split(/\s+/).slice(0, 5).join(' ');
          local[key] = 1;
        });
      });
      Object.keys(local).forEach(function (k) { tCount[k] = (tCount[k] || 0) + 1; });
    });
    var recurringTargets = Object.keys(tCount).filter(function (k) { return tCount[k] >= 2; })
      .map(function (k) { var p = k.split('|'); return { vector: p[0], target: p[1], docs: tCount[k] }; })
      .sort(function (a, b) { return b.docs - a.docs; }).slice(0, 12);

    return {
      version: VERSION,
      documents: results.map(function (r) {
        return {
          name: r.name, words: r.result.words, pressureIndex: r.result.pressureIndex, band: r.result.band.label,
          covertShare: r.result.covertShare, dominantVector: r.result.dominantVector,
          topMechanisms: r.result.mechanisms.slice(0, 3).map(function (m) { return m.name; }),
          hiddenFindings: r.result.hidden.length
        };
      }),
      perDocument: results,
      combined: combined,
      signature: signature,
      sharedPhrases: shared,
      recurringTargets: recurringTargets
    };
  }

  function collapseOverlapping(list) {
    var kept = [];
    list.forEach(function (p) {
      var absorbed = kept.some(function (k) { return k.docs >= p.docs && overlapWords(k.phrase, p.phrase) >= 3; });
      if (!absorbed) kept.push(p);
    });
    return kept;
  }
  function overlapWords(a, b) {
    var A = a.split(' '), B = b.split(' ');
    for (var k = Math.min(A.length, B.length); k > 0; k--) {
      if (A.slice(-k).join(' ') === B.slice(0, k).join(' ') || B.slice(-k).join(' ') === A.slice(0, k).join(' ')) return k;
    }
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Markdown report
  // ---------------------------------------------------------------------------
  function toMarkdown(r, title) {
    var L = [];
    L.push('# Errorfect Undertow — ' + (title || 'scan'));
    L.push('');
    L.push('**Pressure index:** ' + r.pressureIndex + '/100 — ' + r.band.label + '. ' + r.band.note);
    L.push('**Covert share:** ' + r.covertShare + '% of pressure comes from mechanisms that work below the level of an explicit claim.');
    L.push('**Convergence:** ' + r.convergence.note);
    L.push('**Words:** ' + r.words + ' · **Direct address ("you"):** ' + r.address.per100 + ' per 100 words');
    L.push('');
    if (r.convergence.zones.length) {
      L.push('## Convergence zones');
      r.convergence.zones.forEach(function (z) {
        L.push('- ' + z.count + ' mechanisms (' + z.mechanisms.join(', ') + '): "' + z.excerpt + '"');
      });
      L.push('');
    }
    L.push('## Vector mix');
    r.vectors.forEach(function (v) { L.push('- **' + cap(v.kind) + '** ' + v.share + '% — ' + v.label.split(' — ')[1]); });
    L.push('');
    L.push('## Where it is pushing you');
    var any = false;
    ['action', 'belief', 'thought'].forEach(function (v) {
      if (!r.targets[v].length) return;
      any = true;
      L.push('### ' + cap(v));
      r.targets[v].slice(0, 10).forEach(function (t) { L.push('- "' + t.trigger + '" → ' + t.target + ' _(' + t.mechanism + ')_'); });
    });
    if (!any) L.push('_No directional targets captured._');
    L.push('');
    if (!r.mechanisms.length) { L.push('## Mechanisms'); L.push('_None detected._'); }
    LAYER_ORDER.forEach(function (layer) {
      var list = r.mechanisms.filter(function (m) { return m.layer === layer; });
      if (!list.length) return;
      L.push('## ' + LAYER_TITLES[layer]);
      L.push('_' + LAYER_NOTES[layer] + '_');
      list.forEach(function (m) {
        var mech = MECH_BY_ID[m.id];
        L.push('### ' + m.name + ' ×' + m.count + ' ' + covertTag(m.covert));
        if (mech.mask) L.push('**Mask:** ' + mech.mask + ' · **Mechanism:** ' + mech.mechanism);
        L.push(mech.does);
        L.push('- Examples: ' + m.examples.map(function (e) { return '"' + e + '"'; }).join(', '));
        L.push('- **Ask:** ' + mech.question);
      });
      L.push('');
    });
    if (r.hidden.length) {
      L.push('');
      L.push('## Hidden layer');
      r.hidden.forEach(function (h) {
        L.push('- **' + h.kind + '**: ' + h.note + (h.decoded ? ' Decoded: `' + h.decoded.slice(0, 300) + '`' : ''));
      });
    }
    if (r.repetition.length) {
      L.push('');
      L.push('## Repetition (illusory-truth pattern)');
      r.repetition.forEach(function (p) { L.push('- "' + p.phrase + '" ×' + p.count); });
    }
    if (r.probes.length) {
      L.push('');
      L.push('## Errorfect A-probes (remove the first letter)');
      L.push('_A subjective probe, not a decoding. Note what your mind attaches to each fragment._');
      r.probes.forEach(function (p) { L.push('- ' + p.word + ' → **' + p.fragment + '**'); });
    }
    L.push('');
    L.push('## Consent checkpoint');
    CONSENT_QUESTIONS.forEach(function (q, i) { L.push((i + 1) + '. ' + q); });
    L.push('');
    L.push('**D³:** disengage · detect · delay. Verify the origin before engaging emotionally; you do not have to reject the text, only see what it is doing.');
    L.push('');
    L.push('---');
    L.push('_' + EPISTEMIC_NOTE + '_');
    return L.join('\n');
  }

  function corpusToMarkdown(c) {
    var L = [];
    L.push('# Errorfect Undertow — body of work (' + c.documents.length + ' documents)');
    L.push('');
    L.push('| Document | Words | Pressure | Covert | Dominant vector | Top mechanisms | Hidden |');
    L.push('|---|---:|---:|---:|---|---|---:|');
    c.documents.forEach(function (d) {
      L.push('| ' + d.name + ' | ' + d.words + ' | ' + d.pressureIndex + ' | ' + d.covertShare + '% | ' + (d.dominantVector || '—') + ' | ' + (d.topMechanisms.join(', ') || '—') + ' | ' + d.hiddenFindings + ' |');
    });
    L.push('');
    L.push('## Signature (mechanisms recurring across documents)');
    if (!c.signature.length) L.push('_No mechanism recurs across at least half the documents._');
    c.signature.forEach(function (s) { L.push('- ' + s.name + ' — in ' + s.docs + '/' + c.documents.length + ' documents'); });
    L.push('');
    L.push('## Shared phrasing (possible talking points)');
    if (!c.sharedPhrases.length) L.push('_No shared four-word phrasing._');
    c.sharedPhrases.forEach(function (p) { L.push('- "' + p.phrase + '" — ' + p.docs + ' documents'); });
    L.push('');
    L.push('## Recurring targets');
    if (!c.recurringTargets.length) L.push('_No target recurs across documents._');
    c.recurringTargets.forEach(function (t) { L.push('- [' + t.vector + '] ' + t.target + ' — ' + t.docs + ' documents'); });
    L.push('');
    L.push(toMarkdown(c.combined, 'combined corpus').replace(/^# .*\n/, '## Combined scan\n'));
    return L.join('\n');
  }

  function covertTag(c) { return c >= 3 ? '`covert`' : c === 2 ? '`subtle`' : '`overt`'; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  return {
    VERSION: VERSION,
    MECHANISMS: MECHANISMS.map(function (m) {
      return { id: m.id, name: m.name, layer: m.layer, vectors: m.vectors, covert: m.covert, weight: m.weight, mask: m.mask, mechanism: m.mechanism, does: m.does, question: m.question };
    }).concat([{ id: HIDDEN_MECH.id, layer: 'hidden', name: HIDDEN_MECH.name, vectors: HIDDEN_MECH.vectors, covert: 3, weight: 3, does: HIDDEN_MECH.does, question: HIDDEN_MECH.question }]),
    mechanism: function (id) { return MECH_BY_ID[id]; },
    VECTOR_LABELS: VECTOR_LABELS,
    LAYER_ORDER: LAYER_ORDER,
    LAYER_TITLES: LAYER_TITLES,
    LAYER_NOTES: LAYER_NOTES,
    CONSENT_QUESTIONS: CONSENT_QUESTIONS,
    EPISTEMIC_NOTE: EPISTEMIC_NOTE,
    analyze: analyze,
    analyzeCorpus: analyzeCorpus,
    segment: segment,
    stripMarkup: stripMarkup,
    toMarkdown: toMarkdown,
    corpusToMarkdown: corpusToMarkdown
  };
});
