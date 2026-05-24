import type { Meta, StoryObj } from '@storybook/react'
import { Input } from './input.js'

const meta = {
  title: 'UI/Input',
  component: Input,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { label: 'Email', placeholder: 'you@example.com', type: 'email' },
}

export const WithError: Story = {
  args: { label: 'Email', placeholder: 'you@example.com', error: 'Invalid email address' },
}

export const WithHint: Story = {
  args: { label: 'Password', type: 'password', hint: 'At least 8 characters' },
}

export const Required: Story = {
  args: { label: 'App Name', placeholder: 'My App', required: true },
}
