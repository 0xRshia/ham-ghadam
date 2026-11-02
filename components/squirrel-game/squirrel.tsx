import { memo } from "react";

// Art-directed SVG rig based on the supplied Hamghadam character sheets:
// angular head, cream mask, narrow body and oversized curled tail.
export const Squirrel = memo(function Squirrel({ pose = "idle" }: { pose?: "idle" | "run" | "wave" | "caught" } ) {
  return <svg className={`sg-squirrel sg-squirrel-${pose}`} viewBox="0 0 300 340" fill="none" aria-hidden="true">
    <ellipse cx="150" cy="322" rx="71" ry="10" fill="#64361e" opacity=".13" />
    <g className="sg-tail">
      <path d="M140 281C172 263 162 236 174 218C155 171 163 119 193 94C229 64 278 78 286 118C297 165 279 229 241 244C215 255 197 240 201 215C204 196 218 180 219 159C217 184 197 198 194 227C191 259 170 284 140 291Z" fill="#C65D13" />
      <path d="M183 216C169 175 177 125 207 107C234 90 260 101 264 131C269 163 257 194 240 203" stroke="#E27A20" strokeWidth="9" strokeLinecap="round" />
      <path d="M184 249C195 223 185 192 205 161C218 141 235 146 232 168C231 178 226 185 222 188" stroke="#F5DFC4" strokeWidth="3" strokeLinecap="round" />
    </g>
    <g className="sg-body">
      <g className="sg-leg sg-leg-back"><path d="M135 274L147 309C150 313 165 309 170 315C172 321 155 323 143 320C135 316 126 297 123 281Z" fill="#C65D13" /></g>
      <g className="sg-leg sg-leg-front"><path d="M110 272L102 309C94 308 78 309 76 316C76 324 99 323 110 319L126 280Z" fill="#DD731D" /></g>
      <path d="M112 146C113 181 110 204 98 241C87 277 101 294 124 295C153 295 164 275 151 244C137 212 135 174 135 147Z" fill="#E77A1B" />
      <path d="M119 160C126 192 112 224 108 253C105 276 114 284 125 284C139 284 143 272 137 251C129 225 127 195 128 161Z" fill="#F5DFC4" />
      <g className="sg-arm sg-arm-back"><path d="M136 188C152 209 162 236 154 245C146 249 141 241 141 233L128 209" fill="#CD6315" /></g>
      <g className="sg-arm sg-arm-front"><path d="M109 190C102 207 100 225 104 242C106 248 115 246 116 240L120 204" fill="#E77A1B" /><path d="M105 241L110 248L115 242" stroke="#A84F1B" strokeWidth="2" strokeLinecap="round" /></g>
      <g className="sg-head">
        <path d="M48 78L61 27L88 44L112 22L137 42L159 24L176 77L204 101L173 128L130 157L115 157L73 133L37 105Z" fill="#E77A1B" />
        <path d="M56 72L64 44L78 54Z" fill="#A64C18" /><path d="M153 53L160 41L168 72Z" fill="#A64C18" />
        <path d="M40 105L72 88L96 107L121 119L144 107L170 87L202 101L171 126L130 151L115 151L75 128Z" fill="#F5DFC4" />
        <path d="M46 105L65 98L70 115Z" fill="#DE8A76" opacity=".8" /><path d="M179 98L196 104L176 116Z" fill="#DE8A76" opacity=".8" />
        <g className="sg-eyes">
          <path d="M94 84C94 61 64 61 62 86C59 111 91 116 94 94Z" fill="#FFF9ED" />
          <path d="M148 84C149 60 179 64 179 87C179 112 149 114 148 94Z" fill="#FFF9ED" />
          <path d="M77 75V98C86 99 88 87 84 78Z" fill="#9E4918" /><path d="M163 75V98C172 98 173 84 168 77Z" fill="#9E4918" />
        </g>
        <path d="M108 106L121 94L135 106Z" fill="#A64C18" /><path d="M111 111H133L122 119Z" fill="#A64C18" />
        {pose === "caught" ? <path d="M106 128Q122 149 138 128Z" fill="#A64C18" /> : <path d="M112 133Q122 126 132 133" stroke="#A64C18" strokeWidth="2.5" strokeLinecap="round" />}
        <path d="M56 63L49 71M180 63L187 71" stroke="#A64C18" strokeWidth="5" strokeLinecap="round" />
      </g>
    </g>
  </svg>;
});
