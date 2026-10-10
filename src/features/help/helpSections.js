import { BarChart3, Cpu, Database, Dumbbell, Home, Medal, Scale, Settings, Sparkles, Target } from 'lucide-react';

// Usage guide in Romanian, one drawer per menu page; button names stay as they appear in the app.
export const helpSections = [
  { icon: Home, title: 'Today', items: [
    'Aici vezi mesele zilei. Folosește săgețile din antet sau apasă pe dată ca să alegi altă zi; „Back to today” te readuce la ziua curentă.',
    'Apasă butonul + ca să adaugi o masă: descrie ce ai mâncat și alege ora. Poți scana codul de bare al unui produs („Scan barcode”) sau poți alege rapid o masă introdusă anterior din sugestii.',
    'Valorile nutriționale pot fi completate manual („Add values”), fie ca total, fie după gramaj („By weight”), pe baza etichetei produsului.',
    'Butonul ✨ de pe o masă estimează caloriile și macronutrienții cu AI. „Estimate all” estimează dintr-o dată toate mesele fără valori.',
    'Apasă pe textul unei mese ca să o editezi, iar coșul de gunoi o șterge (poți anula din notificare).',
    'Panoul „Daily total” arată totalul zilei față de obiectivele tale. Dacă scorul este activ, insigna de lângă el se completează după ora 21:00.',
  ] },
  { icon: BarChart3, title: 'Reports', items: [
    'Alege perioada: 7 zile, 30 de zile sau 3 luni. Ziua de azi este inclusă după ora 21:00.',
    'Vezi câte zile ai înregistrat, câte au fost în țintă și media meselor pe zi.',
    '„Daily average” arată media de calorii și macronutrienți pe zi înregistrată.',
    'În graficul pe zile poți schimba indicatorul (calorii, proteine etc.). Culorile arată dacă ai fost sub, în țintă sau peste ținta din ziua respectivă; linia de țintă și „Daily average” folosesc obiectivul curent. Apasă pe o coloană ca să deschizi ziua respectivă.',
  ] },
  { icon: Target, title: 'Goal', items: [
    'Setează țintele zilnice pentru calorii, proteine, carbohidrați și grăsimi, apoi apasă „Save”. Modificările se aplică obiectivului curent.',
    '„Suggest with AI” te ghidează în 5 pași (sex, vârstă, înălțime și greutate, nivel de activitate, scop) și propune ținte. Le poți ajusta înainte de salvare.',
    'După ce ai salvat cel puțin o țintă, poți activa „Scoring”, care adaugă pagina Scores în meniu.',
    'Alege obiectivul (slăbire, menținere, creștere în greutate, masă musculară, recompoziție). Ținta rămâne aceeași; obiectivul schimbă doar cum este punctat surplusul sau deficitul. Butonul ⓘ explică fiecare variantă.',
    'Ca să schimbi ținta fără să afectezi zilele trecute, apasă „New goal” în „Goal history” și alege data de la care se aplică (implicit azi). Poți alege și o dată din viitor: obiectivul apare ca „Upcoming” și intră în vigoare singur în ziua respectivă. Fiecare zi este punctată și raportată după obiectivul pe care îl avea atunci.',
    'Un obiectiv se aplică de la data lui de start până când începe următorul. Cel mai vechi obiectiv se aplică și zilelor dinaintea lui.',
    'Apasă pe un obiectiv din „Goal history” ca să-i modifici data de start, țintele sau obiectivul, ori ca să-l ștergi (cu Undo).',
  ] },
  { icon: Medal, title: 'Scores', items: [
    'Apare în meniu doar când scorul este activ din Goal.',
    'Fiecare zi primește un scor de la 0 la 100, în funcție de cât de aproape ai fost de ținte. Scorul unei zile se stabilește după ora 21:00.',
    'Calendarul arată scorurile pe lună și media lunară. Îl poți partaja ca imagine.',
    'Fiecare zi este punctată după obiectivul activ în ziua respectivă, deci un obiectiv nou nu schimbă scorurile trecute.',
    'Apasă pe o zi ca să o deschizi. Pe pagina Today, insigna de scor arată detaliile și modul de calcul.',
  ] },
  { icon: Scale, title: 'Weight', items: [
    'Se activează din Settings › Menus › „Weight track”.',
    'Introdu greutatea și data cântăririi. O singură înregistrare pe zi; una nouă o înlocuiește pe cea veche.',
    'Între două cântăriri vezi diferența de greutate și media zilnică a macronutrienților, calculată doar din zilele complete cu mese înregistrate.',
  ] },
  { icon: Dumbbell, title: 'Workouts', items: [
    'Se activează din Settings › Menus › „Workouts”.',
    'Creează antrenamente („Create a workout”) cu nume, iconiță, exerciții (pe repetări sau pe timp) și notițe.',
    'În calendar alegi ziua și apeși „Start a workout” ca să înregistrezi seturile, repetările și kilogramele. Vezi și ce ai făcut data trecută.',
    'Cu „Select” poți exporta sau șterge mai multe antrenamente; „Import” le aduce înapoi dintr-un fișier.',
  ] },
  { icon: Settings, title: 'Settings › General', items: [
    'Setările sunt împărțite în patru taburi: General, AI, Tokens și Data.',
    'Menus: activează paginile opționale Weight și Workouts.',
    '„Update app” descarcă ultima versiune a aplicației. Datele rămân pe dispozitiv.',
  ] },
  { icon: Sparkles, title: 'Settings › AI', items: [
    'AI config: alege între „Setup code” (codul sau linkul primit) și „Own API key” (cheia ta Google AI sau OpenAI, cu modelul dorit). Doar una dintre variante este folosită.',
    'Dacă ai primit un link de configurare, deschide-l pe telefon. Pe iPhone, după „Add to Home Screen”, deschide aplicația și apasă „Paste setup code”.',
    'Când folosești un setup code, în antet vezi câte cereri AI mai ai azi.',
    'Butonul 👁 din dreptul cheilor le afișează sau le ascunde. „Save settings” se activează doar când ai modificat ceva.',
  ] },
  { icon: Cpu, title: 'Settings › Tokens', items: [
    'Arată consumul de tokeni AI: total, număr de cereri și tokeni generați.',
    'Vezi consumul pe ultimele 7 zile și lista cererilor recente, cu modelul folosit.',
  ] },
  { icon: Database, title: 'Settings › Data', items: [
    'Toate datele sunt salvate doar pe acest dispozitiv. Aici vezi cât spațiu ocupă fiecare tip de date.',
    '„Export” salvează un fișier de backup cu toate datele; „Import” le restaurează. Fă un export înainte de a schimba telefonul sau browserul.',
    'Poți șterge mese, cântăriri și antrenamente dintr-un interval de date. Înainte de confirmare vezi exact ce va fi șters.',
  ] },
];
