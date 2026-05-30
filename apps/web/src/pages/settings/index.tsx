import { useState } from 'react'
import { SettingsNav } from './components/SettingsNav'
import { APIConfigSection } from './components/APIConfigSection'
import { AppearanceSection } from './components/AppearanceSection'

type SettingsSection = 'api' | 'appearance'

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('api')

  return (
    <div className="flex flex-1 overflow-hidden">
      <SettingsNav active={activeSection} onSelect={setActiveSection} />
      <div className="flex-1 overflow-y-auto p-10">
        {activeSection === 'api' && <APIConfigSection />}
        {activeSection === 'appearance' && <AppearanceSection />}
      </div>
    </div>
  )
}
