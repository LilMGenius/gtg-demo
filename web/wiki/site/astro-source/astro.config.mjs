import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
export default defineConfig({ base: "/gtg-demo/web/wiki/site", build: { format: 'file' }, trailingSlash: 'never', integrations: [starlight({
  "disable404Route": true,
  "lastUpdated": false,
  "pagination": false,
  "sidebar": [
    {
      "label": "Home",
      "link": "/"
    },
    {
      "items": [
        {
          "label": "Overview",
          "link": "/category-626f74.html"
        },
        {
          "label": "봇",
          "link": "/bot.html"
        }
      ],
      "label": "bot"
    },
    {
      "items": [
        {
          "label": "Overview",
          "link": "/category-62756666.html"
        },
        {
          "label": "버프",
          "link": "/buff.html"
        }
      ],
      "label": "buff"
    },
    {
      "items": [
        {
          "label": "Overview",
          "link": "/category-636f696e.html"
        },
        {
          "label": "환산",
          "link": "/cash-rate.html"
        },
        {
          "label": "버는 법",
          "link": "/coin.html"
        },
        {
          "label": "먹혀도",
          "link": "/coin-conceded.html"
        },
        {
          "label": "막으면",
          "link": "/coin-save.html"
        }
      ],
      "label": "coin"
    },
    {
      "items": [
        {
          "label": "Overview",
          "link": "/category-6472696c6c.html"
        },
        {
          "label": "능력",
          "link": "/drill.html"
        }
      ],
      "label": "drill"
    },
    {
      "items": [
        {
          "label": "Overview",
          "link": "/category-67616d65.html"
        },
        {
          "label": "이 게임",
          "link": "/game.html"
        }
      ],
      "label": "game"
    },
    {
      "items": [
        {
          "label": "Overview",
          "link": "/category-67656172.html"
        },
        {
          "label": "장비",
          "link": "/gear.html"
        }
      ],
      "label": "gear"
    },
    {
      "items": [
        {
          "label": "Overview",
          "link": "/category-6772616d.html"
        },
        {
          "label": "팔로워와 맞팔",
          "link": "/gram.html"
        },
        {
          "label": "좋아요",
          "link": "/like-base.html"
        },
        {
          "label": "동네 한 등급",
          "link": "/like-per-city.html"
        },
        {
          "label": "맞팔 한도",
          "link": "/mutual-cap.html"
        },
        {
          "label": "맞팔 한 명",
          "link": "/mutual-step.html"
        },
        {
          "label": "같이 한 장",
          "link": "/selfie-base.html"
        }
      ],
      "label": "gram"
    },
    {
      "items": [
        {
          "label": "Overview",
          "link": "/category-68616e64.html"
        },
        {
          "label": "세 칸과 타이밍",
          "link": "/hand.html"
        }
      ],
      "label": "hand"
    },
    {
      "items": [
        {
          "label": "Overview",
          "link": "/category-70756c6c.html"
        },
        {
          "label": "이적시장",
          "link": "/pull.html"
        },
        {
          "label": "묶음 보상",
          "link": "/pull-bonus.html"
        },
        {
          "label": "묶음",
          "link": "/pull-bulk.html"
        },
        {
          "label": "한 장",
          "link": "/pull-cost.html"
        },
        {
          "label": "이용권 한도",
          "link": "/ticket-cap.html"
        }
      ],
      "label": "pull"
    },
    {
      "items": [
        {
          "label": "Overview",
          "link": "/category-7269736b.html"
        },
        {
          "label": "사고",
          "link": "/risk.html"
        }
      ],
      "label": "risk"
    }
  ],
  "title": "gtg Wiki"
}
)] });
