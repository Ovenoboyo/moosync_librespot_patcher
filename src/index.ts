import {
  ExtensionData,
  ExtensionFactory,
  ExtensionPreferenceGroup,
  MoosyncExtensionTemplate
} from '@moosync/moosync-types'
import { LibrespotPatcher } from './extension'

export default class MyExtensionData implements ExtensionData {
  extensionDescriptors: ExtensionFactory[] = [new MyExtensionFactory()]
}

class MyExtensionFactory implements ExtensionFactory {
  async registerPreferences(): Promise<ExtensionPreferenceGroup[]> {
    return [
      {
        key: 'buttons',
        title: 'Librespot',
        type: 'ButtonGroup',
        description: '',
        items: [
          {
            key: 'start',
            title: 'Patch Librespot',
            lastClicked: 0
          }
        ]
      },
      {
        type: 'FilePicker',
        key: 'download-dir',
        title: 'Dependency download directory',
        description: 'Path where all dependencies will be downloaded. Size may exceed 1GiB',
        default: ''
      },
      {
        type: 'FilePicker',
        key: 'build-dir',
        title: 'Librespot build dir',
        description: 'Path where everything will be compiled. Size may exceed 1.5GiB',
        default: ''
      }
    ]
  }

  async create(): Promise<MoosyncExtensionTemplate> {
    return new LibrespotPatcher()
  }
}
