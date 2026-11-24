export const chapters = [
 ['cinema','Cinema Diaries','The films that stayed with us.','✦',['Favourite scene','Favourite dialogue','Recommendation','Question for readers']],
 ['books','Between the Lines','For the words we underlined.','❧',['Author','Favourite character','Favourite quote','Interpretation','Recommendation']],
 ['music','Songs That Found Us','A soundtrack made of strangers.','♫',['Artist','Favourite moment','Dedication','Spotify link','YouTube link']],
 ['places','Places We Leave Pieces of Ourselves','Postcards from places that felt like home.','✧',['Location','Recommendation','Dream destination']],
 ['midnight','The 3 AM Club','Some thoughts only arrive when the rest of the world is asleep.','☾',[]],
 ['letters','Letters Never Sent','For the words that never reached their address.','✉',['To']],
 ['wishes','A Little Wish for You','Small kindnesses, slipped between pages.','♡',['To']],
 ['world','The World Through Our Eyes','Clippings, questions, and what we made of them.','❖',['Source link','Factual claim','Question for readers']],
 ['memories','Before We Forget','The ordinary things worth remembering.','☀',[]],
 ['open','Open When','A letter for the day you need it.','✉',[]],
 ['capsule','For Another Day','Letters sealed for a future date.','⌛',[]],
 ['daily','Question of the Day','A different question on each day’s page.','? ',[]]
];
export const lookup=Object.fromEntries(chapters.map(c=>[c[0],c]));
export const roman=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
export const moods=['Tender','Nostalgic','Hopeful','Restless','Quiet','Joyful','Melancholy','Curious'];
export const envelopes=['you feel lonely','you miss someone','you have had a bad day','you cannot sleep','you need courage','you feel lost','you need a reason to smile','you are happy'];
export const names=['September Rain','The Midnight Poet','Paper Moon','Nobody','A Wandering Soul','The Quiet Stranger','Cinnamon Coffee','Blue Butterfly','Someone Somewhere'];
export const questions=['What song reminds you of a person you no longer speak to?','What is a small moment you wish you could experience again?','What movie changed the way you look at life?','If you could send one anonymous message to someone, what would it say?','What does home mean to you?','What is something you are slowly learning to accept?','What is a beautiful thing you noticed today?','Which fictional character understands you the most?'];
export const today=()=>new Date().toISOString().slice(0,10);
export const questionFor=day=>questions[(((Date.parse(day)/86400000)%questions.length)+questions.length)%questions.length];
export const random=list=>list[Math.floor(Math.random()*list.length)];
export const dateLabel=date=>new Intl.DateTimeFormat('en',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date));
