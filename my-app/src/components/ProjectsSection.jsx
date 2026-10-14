import defaultProjects from '../data/projects';
import { safeUrl } from '../utils/safeUrl';

function ProjectButton({ href, variant, children }) {
  const url = safeUrl(href);
  if (!url) {
    return (
      <span className={`btn btn-${variant} btn-disabled`} aria-disabled="true">
        {children}
      </span>
    );
  }
  return (
    <a className={`btn btn-${variant}`} href={url} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function ProjectsSection({ projects = defaultProjects }) {
  const list = Array.isArray(projects) ? projects : [];
  const stackOf = (project) => (Array.isArray(project.stack) ? project.stack : []);

  return (
    <section className="section projects" id="projects">
      <div className="container">
        <div className="section-title reveal">
          <span className="section-kicker">Projects</span>
          <h2>Websites, APIs, and web apps that feel fast from day one.</h2>
        </div>
        <div className={`projects-grid count-${list.length > 3 ? 'many' : list.length}`}>
          {list.map((project) => {
            const image = safeUrl(project.image) || (project.image?.startsWith('/') && !project.image.startsWith('//') ? project.image : '');
            return (
              <article className="project-card project-card-static reveal layout-top" key={project.slug || project.title}>
                <div className="project-visual fit-cover">
                  <span>{project.category || 'Project'}</span>
                  {image ? (
                    <img src={image} alt={project.title || 'Project preview'} loading="lazy" />
                  ) : (
                    <div className="visual-grid"></div>
                  )}
                </div>
                <div className="project-details">
                  <div className="project-tags">
                    {stackOf(project).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <h3>{project.title}</h3>
                  <p>{project.description}</p>
                  <div className="project-actions">
                    <ProjectButton href={project.url} variant="primary">
                      View Project
                    </ProjectButton>
                    <ProjectButton href={project.github} variant="secondary">
                      View on GitHub
                    </ProjectButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default ProjectsSection;
