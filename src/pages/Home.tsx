import { ArrowRight, CalendarCheck2, CalendarRange, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { appConfig, demoRequested } from '../lib/config';

const steps = [
  ['Создайте опрос', 'Выберите сбор свободного времени или планирование встречи.'],
  ['Поделитесь ссылкой', 'Отправьте её участникам в общий чат команды.'],
  ['Участники отметят время', 'Каждый выберет удобные интервалы — без регистрации.'],
  ['Найдите пересечения', 'Посмотрите результаты и выберите время для общих дел.'],
] as const;

export function Home() {
  return (
    <div className="home-page">
      <section className="home-shell home-hero" aria-labelledby="home-title">
        <div className="home-intro">
          <p className="home-eyebrow">Молодёжная палата<br />Чертаново Центральное</p>
          <h1 id="home-title" className="home-title">{appConfig.name}</h1>
          <p className="home-tagline">Находим время,<br /><span>удобное для всех</span></p>
          <p className="home-description">
            Собираем свободное время участников, находим пересечения в расписаниях
            и выбираем удобные даты для встреч, заседаний и совместных мероприятий.
          </p>
          <div className="home-actions">
            <Link to="/admin/new" className="home-primary-action focus-ring">
              Создать опрос <ArrowRight size={18} aria-hidden="true" />
            </Link>
            {demoRequested && <Link to="/meet/demo" className="home-demo-link focus-ring">Открыть демо</Link>}
          </div>
          <p className="home-action-note">Участникам не нужна регистрация — только ссылка.</p>
        </div>
        <AvailabilityPreview />
      </section>

      <section className="home-shell home-about" aria-labelledby="about-title">
        <div>
          <p className="home-eyebrow">Для наших общих дел</p>
          <h2 id="about-title" className="home-section-title">Меньше согласований —<br />больше совместных дел</h2>
        </div>
        <p>
          Заседания, рабочие встречи и мероприятия проще планировать, когда расписания
          собраны в одном месте. Вместо длинных обсуждений в чате каждый отмечает своё
          время, а организатор видит, когда команда может собраться.
        </p>
      </section>

      <section className="home-shell home-scenarios" aria-labelledby="scenarios-title">
        <p className="home-eyebrow">От расписания к планам</p>
        <h2 id="scenarios-title" className="home-section-title">Два сценария для одной команды</h2>
        <div className="home-scenario-grid">
          <article className="home-scenario">
            <div className="home-scenario-top"><CalendarRange size={23} strokeWidth={1.7} aria-hidden="true" /><span>На дни и недели вперёд</span></div>
            <h3>Свободное время команды</h3>
            <p>Участники отмечают, когда они свободны в ближайшие дни или недели. Организатор получает общую картину для будущих мероприятий — без привязки к одной встрече.</p>
          </article>
          <article className="home-scenario">
            <div className="home-scenario-top"><CalendarCheck2 size={23} strokeWidth={1.7} aria-hidden="true" /><span>Для конкретного события</span></div>
            <h3>Планирование встречи</h3>
            <p>Организатор предлагает несколько дат и длительность встречи. Участники отмечают доступность, а сервис помогает найти подходящие непрерывные интервалы.</p>
          </article>
        </div>
      </section>

      <section className="home-shell home-how" aria-labelledby="how-title">
        <p className="home-eyebrow">От первого опроса до встречи</p>
        <h2 id="how-title" className="home-section-title">Как это работает</h2>
        <ol className="home-steps">
          {steps.map(([title, description], index) => (
            <li key={title}>
              <span className="home-step-number" aria-hidden="true">0{index + 1}</span>
              <div><h3>{title}</h3><p>{description}</p></div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// A static illustration, independent of API data and the working calendar.
function AvailabilityPreview() {
  const days = ['Пн', 'Вт', 'Ср', 'Чт'];
  const rows = [
    { time: '16:00', levels: [1, 2, 0, 1] },
    { time: '16:30', levels: [2, 3, 1, 0] },
    { time: '17:00', levels: [1, 4, 2, 1] },
    { time: '17:30', levels: [0, 4, 3, 2] },
    { time: '18:00', levels: [1, 2, 1, 3] },
  ];
  const labels = ['Нет совпадений', 'Мало совпадений', 'Несколько совпадений', 'Много совпадений', 'Больше всего совпадений'];
  return (
    <figure className="availability-preview" aria-labelledby="preview-title">
      <div className="preview-heading">
        <span className="preview-kicker">Календарь доступности</span>
        <span className="preview-example">Пример</span>
      </div>
      <h2 id="preview-title">Общее свободное время</h2>
      <p className="preview-subtitle">Расписания разные. Пересечения — здесь.</p>
      <table className="preview-calendar">
        <caption className="sr-only">Демонстрация доступности, не реальные ответы участников</caption>
        <thead><tr><th scope="col">Время</th>{days.map((day) => <th scope="col" key={day}>{day}</th>)}</tr></thead>
        <tbody>{rows.map(({ time, levels }) => <tr key={time}>
          <th scope="row">{time}</th>
          {levels.map((level, index) => <td key={days[index]}>
            <span className={`preview-cell preview-level-${level}`}>
              <span className="sr-only">{labels[level]}</span>
              {level === 4 && <Check size={16} strokeWidth={2} aria-hidden="true" />}
            </span>
          </td>)}
        </tr>)}</tbody>
      </table>
      <div className="preview-legend"><span>Меньше</span><span className="preview-scale" aria-hidden="true">{[0, 1, 2, 3, 4].map((level) => <i className={`preview-level-${level}`} key={level} />)}</span><span>Больше совпадений</span></div>
      <figcaption>Пример календаря. Не данные участников.</figcaption>
    </figure>
  );
}
