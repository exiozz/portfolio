import { About, Blog, Gallery, Home, Newsletter, Person, Social, Work } from "@/types";
import { Line, Row, Text } from "@once-ui-system/core";

const person: Person = {
  firstName: "Exiozz",
  lastName: "",
  name: `Exiozz`,
  role: "Developper & Designer",
  avatar: "/images/avatar.jpg",
  email: "tomokari.pro@gmail.com",
  location: "Europe/Paris", // Expecting the IANA time zone identifier, e.g., 'Europe/Vienna'
  languages: ["Français", "English"], // optional: Leave the array empty if you don't want to display languages
  locale: "en", // BCP 47 language tag for the HTML lang attribute, e.g., 'en', 'ja', 'zh-TW'
};

const newsletter: Newsletter = {
  display: false,
  title: <>Subscribe to {person.firstName}'s Newsletter</>,
  description: <>My weekly newsletter about creativity and engineering</>,
};

const social: Social = [
  // Links are automatically displayed.
  // Import new icons in /once-ui/icons.ts
  // Set essentials: true for links you want to show on the about page
  {
    name: "GitHub",
    icon: "github",
    link: "https://github.com/exiozz",
    essential: true,
  },
  {
    name: "Roblox",
    icon: "roblox",
    link: "https://www.roblox.com/fr/users/1675753236/profile",
    essential: true,
  },
  {
    name: "Discord",
    icon: "discord",
    link: "https://discord.gg/zSsgaGQafZ",
    essential: true,
  },
  {
    name: "Email",
    icon: "email",
    link: `mailto:${person.email}`,
    essential: true,
  },
];

const home: Home = {
  path: "/",
  image: "/images/og/home.jpg",
  label: "Home",
  title: `${person.name}'s Portfolio`,
  description: `Portfolio website showcasing my work as a ${person.role}`,
  headline: <>Developing intuitive user experiences</>,
  featured: {
    display: true,
    title: (
      <Row gap="12" vertical="center">
        <strong className="ml-4">Bomb Duels</strong>{" "}
        <Line background="brand-alpha-strong" vert height="20" />
        <Text marginRight="4" onBackground="brand-medium">
          Featured work
        </Text>
      </Row>
    ),
    href: "/work/bombduels",
  },
  subline: (
    <>
      I'm {person.firstName}, a {person.role.toLowerCase()} at{" "}
      <Text as="span" size="xl" weight="strong">Roblox</Text>, where I craft intuitive <br /> user experiences. After hours, I build my own projects.
    </>
  ),
};

const about: About = {
  path: "/about",
  label: "About",
  title: `About – ${person.name}`,
  description: `Meet ${person.name}, ${person.role} from ${person.location}`,
  tableOfContent: {
    display: true,
    subItems: false,
  },
  avatar: {
    display: true,
  },
  calendar: {
    display: true,
    link: "https://cal.com",
  },
  intro: {
    display: true,
    title: "Introduction",
    description: (
      <>
        {person.firstName} is a {person.location.split("/")[1]?.replace("_", " ")} {person.role.toLowerCase()}. He combines code and design to craft
        unique digital experiences. His work focuses on performance optimization
        and interface elegance, bridging the gap between technical logic and creativity.
      </>
    ),
  },
  work: {
    display: true,
    title: "Work Experience",
    experiences: [
      {
        company: "Bomb Duels",
        timeframe: "2026 - Present",
        role: "Lead Developer & Game Designer",
        achievements: [
          <>
            Developed and optimized core gameplay mechanics using Luau, ensuring 
            fluid interactions and stable performance under high load.
          </>,
          <>
            Designed and implemented immersive UI systems that improved player 
            retention and simplified the in-game navigation experience.
          </>,
        ],
        images: [], // Tu peux ajouter ici le chemin vers ta capture d'écran de jeu
      },
      {
        company: "Stradaz Café & Bakery",
        timeframe: "2025 - 2026",
        role: "Head Developer & Designer",
        achievements: [
          <>
            Developed and maintained the digital presence for Stradaz, enhancing brand 
            identity through custom web development and cohesive design systems.
          </>,
          <>
            Optimized customer-facing interfaces, leading to a more intuitive browsing 
            experience and improved accessibility for online orders.
          </>,
        ],
        images: [
          {
            src: "/images/projects/stradaz-cover.jpg",
            alt: "Stradaz Café & Bakery Digital Platform",
            width: 16,
            height: 9,
          },
        ],
      },
    ],
  },
  studies: {
    display: false, // set to false to hide this section
    title: "Studies",
    institutions: [
      {
        name: "University of Jakarta",
        description: <>Studied software engineering.</>,
      },
      {
        name: "Build the Future",
        description: <>Studied online marketing and personal branding.</>,
      },
    ],
  },
  technical: {
    display: true, // set to false to hide this section
    title: "Technical skills",
    skills: [
      {
        title: "Game Development",
        description: (
          <>Building immersive experiences and scripts on the Roblox platform.</>
        ),
        tags: [
          {
            name: "Roblox",
            icon: "roblox", // C'est le nom que tu as défini dans iconLibrary !
          },
        ],
        images: [], // Tu peux laisser vide ou mettre une capture de ton jeu
      },
      {
        title: "Frontend & UI Design",
        description: (
          <>Designing and developing responsive interfaces with a focus on user experience.</>
        ),
        tags: [
          {
            name: "Figma",
            icon: "figma",
          },
          {
            name: "Next.js",
            icon: "nextjs",
          },
        ],
        images: [],
      },
    ],
  },
};

const blog: Blog = {
  path: "/blog",
  label: "Blog",
  title: `Blog – ${person.name}`,
  description: `Read what ${person.name} has been up to recently`,
  // Create new blog posts by adding a new .mdx file to app/blog/posts
  // All posts will be listed on the /blog route
};

const work: Work = {
  path: "/work",
  label: "Work",
  title: `Projects – ${person.name}`,
  description: `Design and dev projects by ${person.name}`,
  // Create new project pages by adding a new .mdx file to app/blog/posts
  // All projects will be listed on the /home and /work routes
};

const gallery: Gallery = {
  path: "/gallery",
  label: "Gallery",
  title: `Photo gallery – ${person.name}`,
  description: `A photo collection by ${person.name}`,
  // Images by https://lorant.one
  // These are placeholder images, replace with your own
  images: [
    {
      type: "image",
      src: "/images/gallery/arrosoir.jpg",
      alt: "image",
      orientation: "horizontal",
      category: "Model 3D",
    },
    {
      type: "image",
      src: "/images/gallery/banc.jpg",
      alt: "image",
      orientation: "horizontal",
      category: "Model 3D",
    },
    {
      type: "image",
      src: "/images/gallery/home.jpg",
      alt: "image",
      orientation: "horizontal",
      category: "Model 3D",
    },
    {
      type: "image",
      src: "/images/gallery/meubletv.jpg",
      alt: "image",
      orientation: "horizontal",
      category: "Model 3D",
    },
    {
      type: "image",
      src: "/images/gallery/ordi.jpg",
      alt: "image",
      orientation: "horizontal",
      category: "Model 3D",
    },
    {
      type: "image",
      src: "/images/gallery/poubelle.jpg",
      alt: "image",
      orientation: "horizontal",
      category: "Model 3D",
    },
    {
      type: "image",
      src: "/images/gallery/1.jpg",
      alt: "image",
      orientation: "horizontal",
      category: "UI Design (Roblox)",
    },
    {
      type: "image",
      src: "/images/gallery/2.jpg",
      alt: "image",
      orientation: "horizontal",
      category: "UI Design (Roblox)",
    },
    {
      type: "image",
      src: "/images/gallery/3.jpg",
      alt: "image",
      orientation: "horizontal",
      category: "UI Design (Roblox)",
    },
    {
      type: "image",
      src: "/images/gallery/4.jpg",
      alt: "image",
      orientation: "horizontal",
      category: "UI Design (Roblox)",
    },
    {
      type: "image",
      src: "/images/gallery/5.jpg",
      alt: "image",
      orientation: "horizontal",
      category: "UI Design (Roblox)",
    },
    {
      type: "model",
      src: "/models/cartonbox.glb",
      alt: "Modèle 3D d'un carton",
      orientation: "horizontal",
      category: "Model 3D",
    },

  ],
};

export { person, social, newsletter, home, about, blog, work, gallery };
