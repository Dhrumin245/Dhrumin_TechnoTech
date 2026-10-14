/**
 * Projects shown in the "Projects" section of the home page.
 *
 * To add a project, copy one object below. Fields:
 *   title        - project name
 *   slug         - unique id (used as the React key)
 *   category     - small label on the card image (e.g. "Web App")
 *   description  - short introduction of the project
 *   stack        - array of technology tags
 *   image        - optional. Path under /public (e.g. "/projects/my-app.png") or https URL.
 *                  Leave empty to use the default grid visual.
 *   url          - live project URL           ("View Project" button)
 *   github       - GitHub repository URL      ("View on GitHub" button)
 *
 * Only http(s) links are rendered; a missing/invalid link shows a disabled button.
 */
const projects = [
  {
    title: "Dhrumin's TechnoTech World",
    slug: 'technotech-world',
    category: 'Website',
    description:
      'This portfolio and agency website: a React + Vite frontend with a Node.js/Express contact API featuring OTP email verification, deployed with a CI/CD pipeline.',
    stack: ['React', 'Vite', 'Node.js', 'Express', 'MongoDB'],
    image: '',
    url: 'https://www.dhrumintechnotech.in',
    github: 'https://github.com/Dhrumin245/Dhrumin_TechnoTech',
  },
];

export default projects;
