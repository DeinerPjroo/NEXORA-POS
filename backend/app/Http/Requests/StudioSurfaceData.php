<?php

namespace App\Http\Requests;

trait StudioSurfaceData
{
    public function scopeData(): array
    {
        // Surface is supplied exclusively by the server route, never the request body.
        $surface = $this->route('studio_surface', 'pos');

        return $surface === 'pos' ? $this->validated() : [...$this->validated(), 'surface' => $surface];
    }
}
