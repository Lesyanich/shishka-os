/**
 * WebUSB transport for the XP-420B label printer.
 *
 * RawBT rasterizes everything as ESC/POS (it printed our TSPL as literal text),
 * so it can't drive the printer in its native TSPL language. WebUSB lets Chrome
 * on the Android tablet talk to the USB printer directly and send raw TSPL bytes
 * — the exact bytes that printed perfectly over USB from the Mac. No RawBT, no
 * driver, no drift.
 *
 * Connection: tablet → printer via USB (OTG cable). One-time device grant via a
 * user gesture (requestDevice); afterwards the grant persists and getDevices()
 * returns it silently.
 */

// XP-420B: Vendor 0x2d37 (Xprinter), Product 0x83d7.
const XPRINTER_VENDOR_ID = 0x2d37

// Minimal WebUSB typings (not in lib.dom; avoids adding @types/w3c-web-usb).
interface UsbEndpoint {
  endpointNumber: number
  direction: 'in' | 'out'
  type: string
}
interface UsbAltInterface {
  endpoints: UsbEndpoint[]
}
interface UsbInterface {
  interfaceNumber: number
  alternate: UsbAltInterface
}
interface UsbConfiguration {
  interfaces: UsbInterface[]
}
export interface UsbDevice {
  vendorId: number
  productId: number
  opened: boolean
  configuration: UsbConfiguration | null
  open(): Promise<void>
  close(): Promise<void>
  selectConfiguration(n: number): Promise<void>
  claimInterface(n: number): Promise<void>
  transferOut(endpointNumber: number, data: Uint8Array): Promise<{ status: string }>
}
interface UsbApi {
  getDevices(): Promise<UsbDevice[]>
  requestDevice(opts: { filters: { vendorId?: number; productId?: number }[] }): Promise<UsbDevice>
}

function usb(): UsbApi | null {
  return (navigator as unknown as { usb?: UsbApi }).usb ?? null
}

export function isWebUsbSupported(): boolean {
  return usb() !== null
}

/** Returns a previously-granted printer, or null if none granted yet. */
export async function getGrantedPrinter(): Promise<UsbDevice | null> {
  const api = usb()
  if (!api) return null
  const devices = await api.getDevices()
  return devices.find((d) => d.vendorId === XPRINTER_VENDOR_ID) ?? null
}

/** Prompts the user to pick + grant the printer. Must be called from a click. */
export async function requestPrinter(): Promise<UsbDevice | null> {
  const api = usb()
  if (!api) throw new Error('WebUSB not supported in this browser')
  try {
    return await api.requestDevice({ filters: [{ vendorId: XPRINTER_VENDOR_ID }] })
  } catch {
    // User dismissed the chooser.
    return null
  }
}

let cachedOut: { device: UsbDevice; endpoint: number } | null = null

async function ensureClaimed(device: UsbDevice): Promise<number> {
  if (cachedOut && cachedOut.device === device && device.opened) return cachedOut.endpoint
  if (!device.opened) await device.open()
  if (!device.configuration) await device.selectConfiguration(1)
  const config = device.configuration
  if (!config) throw new Error('Printer has no USB configuration')
  const iface =
    config.interfaces.find((i) =>
      i.alternate.endpoints.some((e) => e.direction === 'out' && e.type === 'bulk'),
    ) ?? config.interfaces[0]
  await device.claimInterface(iface.interfaceNumber)
  const ep = iface.alternate.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')
  if (!ep) throw new Error('Printer has no bulk OUT endpoint')
  cachedOut = { device, endpoint: ep.endpointNumber }
  return ep.endpointNumber
}

/** Send raw bytes to the printer over WebUSB. */
export async function sendRawViaUSB(device: UsbDevice, bytes: Uint8Array): Promise<void> {
  try {
    const endpoint = await ensureClaimed(device)
    await device.transferOut(endpoint, bytes)
  } catch (err) {
    cachedOut = null // force re-open next time
    throw err
  }
}
