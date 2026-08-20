import TomatoMark from './TomatoMark.jsx'
import { HeartIcon } from './icons.jsx'

export default function ThankYouScreen({ thankYou, organization }) {
  return (
    <section className="card thanks" aria-labelledby="thanks-title">
      <span className="halo mark-wrap">
        <TomatoMark size={92} />
      </span>
      <h1 id="thanks-title">{thankYou.title}</h1>
      <p className="body">{thankYou.body}</p>
      <p className="stamp">
        <HeartIcon />
        With gratitude, {organization}
      </p>
    </section>
  )
}
