import React from 'react'

interface TopbarProps {
  title: string
  actions?: React.ReactNode
}

export function Topbar({ title, actions }: TopbarProps) {
  return (
    <div className="topbar">
      <span className="topbar-title">{title}</span>
      <div className="topbar-spacer" />
      {actions}
    </div>
  )
}
