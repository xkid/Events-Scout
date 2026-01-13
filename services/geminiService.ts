import { GoogleGenAI, Type } from "@google/genai";
import { EventData, Country, Venue, CompanyInfo } from "../types";

// Helper to get formatted date range
const getYearRange = () => {
  const currentYear = new Date().getFullYear();
  return `${currentYear} and ${currentYear + 1}`;
};

const getApiKey = () => {
  let apiKey = "";

  // 1. Try Vite standard (Works for Netlify + Vite)
  // Note: In Netlify, you MUST name the variable 'VITE_API_KEY' for it to be exposed to the browser.
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
      // @ts-ignore
      apiKey = import.meta.env.VITE_API_KEY;
    }
  } catch (e) {
    // Ignore errors if import.meta is not defined
  }

  // 2. Try standard process.env (Works for Webpack/CRA or if defined in build config)
  if (!apiKey) {
    try {
      if (typeof process !== 'undefined' && process.env) {
        if (process.env.API_KEY) apiKey = process.env.API_KEY;
        else if (process.env.VITE_API_KEY) apiKey = process.env.VITE_API_KEY;
        else if (process.env.REACT_APP_API_KEY) apiKey = process.env.REACT_APP_API_KEY;
      }
    } catch (e) {
      // Ignore ReferenceError if process is not defined in browser
    }
  }

  if (!apiKey) {
    console.error("CRITICAL ERROR: API Key is missing.");
    console.error("For Netlify: Ensure you have set 'VITE_API_KEY' in Site Settings > Environment Variables.");
    throw new Error("API Key not found. Please set VITE_API_KEY in your environment.");
  }
  
  return apiKey;
};

// Step 1: Get the list of events (Basic Info)
export const searchEventList = async (country: Country): Promise<Omit<EventData, 'companies' | 'id'>[]> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  // Filter venues to only include those relevant to the requested country
  const venues = Object.values(Venue).filter(v => {
    if (country === Country.Thailand) return v.includes('Impact') || v.includes('BITEC') || v.includes('Queen Sirikit');
    if (country === Country.Malaysia) return v.includes('Kuala Lumpur') || v.includes('MITEC') || v.includes('SPICE') || v.includes('Penang');
    if (country === Country.Singapore) return v.includes('Singapore EXPO') || v.includes('Marina Bay');
    if (country === Country.Indonesia) return v.includes('Jakarta') || v.includes('Indonesia Convention');
    if (country === Country.Philippines) return v.includes('SMX') || v.includes('World Trade Center');
    if (country === Country.Vietnam) return v.includes('Saigon') || v.includes('Hanoi');
    if (country === Country.UAE) return v.includes('Dubai');
    if (country === Country.Germany) return v.includes('Messe') || v.includes('Koelnmesse');
    if (country === Country.Australia) return v.includes('Sydney') || v.includes('Melbourne');
    if (country === Country.Europe) return v.includes('Fira') || v.includes('Paris') || v.includes('RAI') || v.includes('Messe'); 
    return false;
  });

  const venueString = venues.join(", ");
  const yearRange = getYearRange();

  const prompt = `
    Search for the major trade shows, exhibitions, and conventions calendar for ${yearRange} in ${country} specifically at these venues: ${venueString}.
    
    Return a list of events with their accurate start/end dates and specific venue name.
    Do not invent events. Only return events found in search results.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Official name of the event" },
              dateStart: { type: Type.STRING, description: "Start date in YYYY-MM-DD format" },
              dateEnd: { type: Type.STRING, description: "End date in YYYY-MM-DD format" },
              venueName: { type: Type.STRING, description: "Name of the venue" },
              description: { type: Type.STRING, description: "One sentence description" }
            },
            required: ["name", "dateStart", "dateEnd", "venueName"]
          }
        }
      }
    });

    const rawData = JSON.parse(response.text || "[]");
    
    if (!Array.isArray(rawData)) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rawData.map((item: any) => {
      // Heuristic to match string venue to Enum
      let matchedVenue = venues[0]; // Default
      
      // CRITICAL FIX: Only iterate through the 'venues' valid for this country
      // NOT Object.values(Venue), which would include other countries' venues (e.g. Manila vs Dubai WTC)
      for (const v of venues) {
        if (item.venueName && item.venueName.toLowerCase().includes(v.toLowerCase().split(' ')[0])) {
          matchedVenue = v;
          break;
        }
      }

      return {
        name: item.name,
        dateStart: item.dateStart,
        dateEnd: item.dateEnd,
        venue: matchedVenue,
        country: country,
        description: item.description,
      };
    });

  } catch (error) {
    console.error("Gemini List Search Error:", error);
    throw error;
  }
};

// Step 2: Enrich specific event with deep dive (Second Level Search)
export const enrichEventDetails = async (eventName: string, venue: string, country: string): Promise<CompanyInfo[]> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const prompt = `
    Research the event "${eventName}" at ${venue}, ${country}.
    
    Task:
    1. Find the official Organizer's name.
    2. Find 2-3 major Exhibitors or Sponsors participating in this event.
    3. STRICTLY VERIFY email and contact numbers from the company's official website.
    
    CRITICAL: If you cannot find a verified email or phone number on the official company website or a reliable directory, return an EMPTY STRING ("") for those fields. Do not guess.

    Return the data strictly as a JSON object.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            organizer: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                email: { type: Type.STRING },
                contact: { type: Type.STRING }
              }
            },
            exhibitors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  email: { type: Type.STRING },
                  role: { type: Type.STRING, description: "e.g., Exhibitor, Sponsor" }
                }
              }
            }
          }
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    const companies: CompanyInfo[] = [];

    if (data.organizer && data.organizer.name) {
      companies.push({
        name: data.organizer.name,
        email: data.organizer.email || "",
        contact: data.organizer.contact || "",
        role: 'Organizer'
      });
    }

    if (data.exhibitors && Array.isArray(data.exhibitors)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.exhibitors.forEach((ex: any) => {
        companies.push({
          name: ex.name,
          email: ex.email || "",
          role: 'Exhibitor'
        });
      });
    }

    return companies;

  } catch (error) {
    console.error(`Gemini Detail Search Error for ${eventName}:`, error);
    return []; // Return empty on error to not break the whole flow
  }
};

// Step 3: Massive Deep Dive for a single event
export const findExtendedExhibitors = async (eventName: string, venue: string, country: string): Promise<CompanyInfo[]> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const prompt = `
    Perform an extensive search for the exhibitor list for the event "${eventName}" at ${venue}, ${country}.
    
    Your goal is to list AS MANY participating companies, exhibitors, and sponsors as possible (aim for 20-50+ companies).
    
    For each company:
    1. Provide the Company Name.
    2. Try to find a contact email or phone number.
    3. Label them as 'Exhibitor' or 'Sponsor'.
    
    CRITICAL RULE FOR CONTACT INFO:
    You MUST double check the email and contact number from the company's official website.
    If you cannot verify it from the official website, YOU MUST LEAVE THE FIELD EMPTY. 
    Do NOT provide general info@ emails unless they are explicitly listed on the contact page.
    Do NOT invent or guess contact details.

    Return the data strictly as a JSON array of objects.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              email: { type: Type.STRING },
              contact: { type: Type.STRING },
              role: { type: Type.STRING }
            },
            required: ["name"]
          }
        }
      }
    });

    const rawData = JSON.parse(response.text || "[]");
    if (!Array.isArray(rawData)) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rawData.map((item: any) => ({
      name: item.name,
      email: item.email || "",
      contact: item.contact || "",
      role: item.role || "Exhibitor"
    }));

  } catch (error) {
    console.error(`Gemini Extended Search Error for ${eventName}:`, error);
    return [];
  }
};

// Step 4: Draft Email Content
export const draftEmailContent = async (eventName: string, venue: string, country: string, instructions: string): Promise<{ subject: string; body: string }> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const prompt = `
    You are a professional business development manager.
    Write a cold email draft regarding the event "${eventName}" which is held at ${venue}, ${country}.
    
    User Specific Instructions for the email content: "${instructions || "Write a general inquiry about exhibiting opportunities and booth pricing."}"
    
    Requirements:
    - Tone: Professional, polite, and concise.
    - Context: The user wants to contact participants or organizers of this event.
    - Output: A JSON object with a subject line and the body text.
    - Use placeholders like [Your Name] and [Your Company] where appropriate.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING, description: "The email subject line" },
            body: { type: Type.STRING, description: "The email body text" }
          },
          required: ["subject", "body"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return {
      subject: data.subject || `Inquiry: ${eventName}`,
      body: data.body || "Could not generate draft."
    };
  } catch (error) {
    console.error("Gemini Email Draft Error:", error);
    return {
      subject: `Inquiry regarding ${eventName}`,
      body: `Dear Team,\n\nI am writing to inquire about ${eventName}.\n\nBest regards,\n[Your Name]`
    };
  }
};