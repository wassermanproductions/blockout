#!/usr/bin/env node
/**
 * Blockout MCP server — zero-dependency Node >=18 stdio bridge.
 *
 * Speaks the MCP stdio transport: newline-delimited JSON-RPC 2.0 on
 * stdin/stdout (NOT Content-Length framed). Each tools/call is forwarded to
 * the running app's HTTP control server, discovered via
 * ~/.config/blockout/control.json (random localhost port + bearer token).
 *
 * Uses only node built-ins + global fetch — run directly with `node`.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DISCOVERY_FILE = join(homedir(), '.config', 'blockout', 'control.json')
const PROTOCOL_VERSION = '2024-11-05'

/* --------------------------------- tools -------------------------------- */

// Each tool name maps to a control action of the SAME name; the tool's input
// object is passed through verbatim as that action's params.
const TOOLS = [
  {
    name: 'get_state',
    description:
      'Call FIRST. Returns a summary of the current project, scene, and active shot: the placed entities (id, asset, label, position) and the choreography marks on the timeline (actor + camera). Coordinates are in meters, +X is right, -Z is forward/away from the default camera; heading 0 faces -Z; rotationDeg is clockwise seen from above.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_assets',
    description:
      'List the placeable asset catalog (people, animals, vehicles, furniture, environment kits, primitives). Use an assetId from here with add_entity. Optionally filter by category.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional category filter, e.g. "people", "vehicles", "environment".'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'add_entity',
    description:
      'Place a new entity on the ground. x/z in meters (+X right, -Z away); rotationDeg is clockwise from above with 0 facing -Z. Returns the new entity id.',
    inputSchema: {
      type: 'object',
      properties: {
        assetId: { type: 'string', description: 'An id from list_assets, e.g. "person.man".' },
        x: { type: 'number', description: 'X position in meters (+X right).' },
        z: { type: 'number', description: 'Z position in meters (-Z forward/away).' },
        label: { type: 'string', description: 'Optional short uppercase label, e.g. "HERO".' },
        rotationDeg: { type: 'number', description: 'Optional heading in degrees, clockwise from above; 0 faces -Z.' }
      },
      required: ['assetId', 'x', 'z'],
      additionalProperties: false
    }
  },
  {
    name: 'move_entity',
    description: 'Reposition an existing entity. Omitted fields are left unchanged.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'Entity id from get_state.' },
        x: { type: 'number', description: 'X in meters (+X right).' },
        z: { type: 'number', description: 'Z in meters (-Z away).' },
        y: { type: 'number', description: 'Optional height in meters above ground.' },
        rotationDeg: { type: 'number', description: 'Optional heading, clockwise from above; 0 faces -Z.' }
      },
      required: ['entityId', 'x', 'z'],
      additionalProperties: false
    }
  },
  {
    name: 'delete_entity',
    description: 'Remove an entity from the scene.',
    inputSchema: {
      type: 'object',
      properties: { entityId: { type: 'string', description: 'Entity id from get_state.' } },
      required: ['entityId'],
      additionalProperties: false
    }
  },
  {
    name: 'add_actor_mark',
    description:
      'Drop a timeline mark for an actor entity: at time t (seconds) the actor is at x,z. Chain marks to choreograph a walk. gait sets the movement style between marks.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'The actor entity id.' },
        x: { type: 'number', description: 'X in meters (+X right).' },
        z: { type: 'number', description: 'Z in meters (-Z away).' },
        time: { type: 'number', description: 'Time of the mark in seconds.' },
        gait: {
          type: 'string',
          enum: ['walk', 'jog', 'run', 'stand'],
          description: 'Movement style approaching this mark.'
        }
      },
      required: ['entityId', 'x', 'z', 'time'],
      additionalProperties: false
    }
  },
  {
    name: 'add_camera_mark',
    description:
      'Drop a camera mark at time t: camera at x,y,z (meters, y is height) looking with panDeg (clockwise from above, 0 faces -Z) and tiltDeg (positive looks up, negative down). focalLength in mm on Super 35 (24 wide, 35 normal, 50-85 tight).',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Camera X in meters (+X right).' },
        y: { type: 'number', description: 'Camera height in meters above ground.' },
        z: { type: 'number', description: 'Camera Z in meters (-Z away).' },
        panDeg: { type: 'number', description: 'Pan in degrees, clockwise from above; 0 faces -Z.' },
        tiltDeg: { type: 'number', description: 'Tilt in degrees; positive up, negative down.' },
        time: { type: 'number', description: 'Time of the mark in seconds.' },
        focalLength: { type: 'number', description: 'Optional focal length in mm (Super 35).' }
      },
      required: ['x', 'y', 'z', 'panDeg', 'tiltDeg', 'time'],
      additionalProperties: false
    }
  },
  {
    name: 'clear_camera_marks',
    description: 'Remove all camera marks from the active shot (keeps actor marks).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'set_shot',
    description: 'Update the active shot settings. Omitted fields are unchanged.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Shot name.' },
        duration: { type: 'number', description: 'Shot duration in seconds.' },
        aspect: { type: 'string', description: 'Aspect ratio, e.g. "16:9", "9:16", "2.39:1".' },
        fps: { type: 'number', description: 'Frames per second.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'new_shot',
    description: 'Create a new shot in the current scene (same blocking, fresh camera). Returns the new shot.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Optional name for the new shot.' } },
      additionalProperties: false
    }
  },
  {
    name: 'apply_framing',
    description:
      'Auto-frame the camera using a preset relative to the labelled subjects: 2S (two-shot), OTS (over-the-shoulder), REV (reverse), TOP (top-down), LOW (low angle), DUTCH (canted).',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['2S', 'OTS', 'REV', 'TOP', 'LOW', 'DUTCH'],
          description: 'Framing preset.'
        }
      },
      required: ['kind'],
      additionalProperties: false
    }
  },
  {
    name: 'list_action_presets',
    description:
      'List motion-path presets for non-character performers: plane takeoff/landing/flyby, helicopter orbit, bird swoop, car chase moves, falling debris, thrown objects. Call before apply_action_preset.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'apply_action_preset',
    description:
      "Lay a full motion path (with altitude) on an entity from its current pose: plane-takeoff, heli-orbit, car-chase-weave, debris-fall… Replaces the entity's existing marks.",
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'Entity id from get_state.' },
        presetId: { type: 'string', description: 'Preset id from list_action_presets.' }
      },
      required: ['entityId', 'presetId'],
      additionalProperties: false
    }
  },
  {
    name: 'list_sequence_styles',
    description: 'List the styles available per sequence type for spawn_sequence (dance styles, fight formats, chase modes).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'spawn_sequence',
    description:
      'Stage a whole choreographed crowd in one call: N dancers performing together, a paired brawl or mob fight, a foot chase, or a car chase. Creates the performers AND their choreography. Position with x/z/headingDeg (heading 0 faces -Z).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['dance', 'fight', 'footChase', 'carChase'] },
        count: { type: 'number', description: 'Number of performers (2-60).' },
        style: { type: 'string', description: 'Style id from list_sequence_styles (e.g. a dance preset id, "paired", "weaving").' },
        x: { type: 'number', description: 'Stage center X in meters (default 0).' },
        z: { type: 'number', description: 'Stage center Z in meters (default 0).' },
        headingDeg: { type: 'number', description: 'Facing/travel direction in degrees (default 0).' }
      },
      required: ['type', 'count'],
      additionalProperties: false
    }
  },
  {
    name: 'list_camera_moves',
    description:
      'List the classic camera-move presets (orbits, cranes, drone follows, vertigo dolly-zoom, whip pan…) with ids, categories, and descriptions. Call before apply_camera_move.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'apply_camera_move',
    description:
      "Apply a classic camera-move preset to the active shot camera: generates a full set of camera marks over the shot built around a subject, riding along if the subject moves (e.g. drone-follow a flying plane). Track-style moves also enable aim-lock. Replaces the camera's existing marks.",
    inputSchema: {
      type: 'object',
      properties: {
        presetId: {
          type: 'string',
          description:
            'Preset id from list_camera_moves (e.g. "orbit-180", "follow-behind", "vertigo-dolly-zoom").'
        },
        entityId: {
          type: 'string',
          description: 'Subject to build the move around. Omit to use the first person in the scene.'
        }
      },
      required: ['presetId'],
      additionalProperties: false
    }
  },
  {
    name: 'set_track_subject',
    description:
      'Aim-lock the shot camera onto an entity: the camera stays pointed at it no matter how its position moves (marks, recordings, presets). Pass no entityId to turn tracking off.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'Entity id to track; omit to disable tracking.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'snap_to_ground',
    description: 'Drop an entity so it rests on the ground plane (y = 0 at its feet).',
    inputSchema: {
      type: 'object',
      properties: { entityId: { type: 'string', description: 'Entity id from get_state.' } },
      required: ['entityId'],
      additionalProperties: false
    }
  },
  {
    name: 'set_time',
    description: 'Scrub the timeline playhead to time t (seconds).',
    inputSchema: {
      type: 'object',
      properties: { t: { type: 'number', description: 'Time in seconds.' } },
      required: ['t'],
      additionalProperties: false
    }
  },
  {
    name: 'play',
    description: 'Start timeline playback from the current playhead.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'stop',
    description: 'Stop timeline playback.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'screenshot',
    description:
      'Capture the current viewport as a PNG image and return it. Use after staging or scrubbing to see what the shot looks like.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_presets',
    description: 'List saved global stage presets (reusable staging setups) as { id, name, savedAt, entityCount }.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'save_preset',
    description: 'Save the current staging as a named global preset for reuse across projects.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name for the preset.' } },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'apply_preset',
    description: 'Load a saved stage preset by id into the current scene.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Preset id from list_presets.' } },
      required: ['id'],
      additionalProperties: false
    }
  }
]

const TOOL_NAMES = new Set(TOOLS.map((t) => t.name))

/* ------------------------------ control call ---------------------------- */

const NOT_RUNNING = "Blockout isn't running — launch the app first."

async function callControl(action, params) {
  let config
  try {
    config = JSON.parse(await readFile(DISCOVERY_FILE, 'utf-8'))
  } catch {
    return { error: NOT_RUNNING }
  }
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`
      },
      body: JSON.stringify({ action, params: params ?? {} })
    })
    return { response: await res.json() }
  } catch {
    return { error: NOT_RUNNING }
  }
}

/* ---------------------------- JSON-RPC plumbing ------------------------- */

function write(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function reply(id, result) {
  write({ jsonrpc: '2.0', id, result })
}

function replyError(id, code, message) {
  write({ jsonrpc: '2.0', id, error: { code, message } })
}

async function handleToolCall(id, params) {
  const name = params?.name
  const args = params?.arguments ?? {}
  if (!TOOL_NAMES.has(name)) {
    reply(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true })
    return
  }
  const { response, error } = await callControl(name, args)
  if (error) {
    reply(id, { content: [{ type: 'text', text: error }], isError: true })
    return
  }
  // Image special-case: an ok screenshot returns base64 PNG data.
  if (response && response.ok && response.data && typeof response.data.imageBase64 === 'string') {
    reply(id, { content: [{ type: 'image', data: response.data.imageBase64, mimeType: 'image/png' }] })
    return
  }
  reply(id, {
    content: [{ type: 'text', text: JSON.stringify(response) }],
    isError: response && response.ok === false
  })
}

async function handle(msg) {
  const { id, method, params } = msg
  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'blockout', version: '1.0.0' }
      })
      return
    case 'notifications/initialized':
      return // notification, no reply
    case 'tools/list':
      reply(id, { tools: TOOLS })
      return
    case 'tools/call':
      await handleToolCall(id, params)
      return
    case 'ping':
      reply(id, {})
      return
    default:
      // Notifications (no id) are ignored; requests get method-not-found.
      if (id !== undefined && id !== null) replyError(id, -32601, `Method not found: ${method}`)
      return
  }
}

/* ------------------------------- stdin loop ----------------------------- */

let buffer = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let idx
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue // ignore non-JSON lines
    }
    void handle(msg)
  }
})
process.stdin.on('end', () => process.exit(0))
